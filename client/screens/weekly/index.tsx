import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import ChatInputBar from '@/components/ChatInputBar';
import ChatOverlay, { ChatMsg } from '@/components/ChatOverlay';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { api, Task, TYPE_META } from '@/utils/api';
import { weekMondayG8, nextMondayG8, weekSundayG8, nextSundayG8, todayG8 } from '@/utils/gmt8';
import RNSSE from 'react-native-sse';

const API_BASE = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? '').replace(/\/$/, '');

// 本周周一日期（GMT+8）
const WEEK_MONDAY = weekMondayG8;
// 本周周日日期
const WEEK_SUNDAY = weekSundayG8;
// 下周周一（本周周一 + 7 天）
const NEXT_MONDAY = nextMondayG8;
// 下周周日
const NEXT_SUNDAY = nextSundayG8;

// 依据当前所选周期算出 [monday, sunday]
function rangeForPeriod(period: 'this' | 'next'): { monday: string; sunday: string } {
  return period === 'next'
    ? { monday: NEXT_MONDAY(), sunday: NEXT_SUNDAY() }
    : { monday: WEEK_MONDAY(), sunday: WEEK_SUNDAY() };
}

const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function weekDays(monday: string): string[] {
  const base = dayjs(monday);
  return Array.from({ length: 7 }, (_, i) => base.add(i, 'day').format('YYYY-MM-DD'));
}

type Period = 'this' | 'next';

export default function WeeklyPage() {
  const router = useSafeRouter();

  // 周期切换（本周 / 下周）
  const [period, setPeriod] = useState<Period>('this');

  // 出行日
  const [travelDays, setTravelDays] = useState<string[]>([]);
  const [travelEditorVisible, setTravelEditorVisible] = useState(false);
  const [travelDraft, setTravelDraft] = useState<Set<string>>(new Set());

  // 本周目标
  const [goals, setGoals] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // 对话
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatRef = useRef<ChatMsg[]>([]);
  const [createdToast, setCreatedToast] = useState<string | null>(null);

  const { monday, sunday } = rangeForPeriod(period);
  const daysInPeriod = useMemo(() => weekDays(monday), [monday]);

  const fetchTravelDays = useCallback(async () => {
    try {
      const res = await api.getTravelDays(monday);
      setTravelDays(res.data);
    } catch {
      /* ignore */
    }
  }, [monday]);

  const fetchWeekly = useCallback(async () => {
    try {
      // 当前周期目标：task_type=goal 且 归属周=weekKey（plan_date 落于本周）
      const goalRes = await api.listRange(
        monday,
        sunday,
        undefined,
        monday, // weekKey，用于归并"目标"
      );
      const all = goalRes.data;
      setGoals(all.filter((t) => t.task_type === 'goal'));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [monday, sunday]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchTravelDays();
      fetchWeekly();
    }, [fetchTravelDays, fetchWeekly]),
  );

  // 切换周期后重载数据
  useEffect(() => {
    setLoading(true);
    setTravelDays([]);
    setGoals([]);
    fetchTravelDays();
    fetchWeekly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const openTravelEditor = () => {
    setTravelDraft(new Set(travelDays));
    setTravelEditorVisible(true);
  };

  const toggleTravelDraft = (d: string) => {
    setTravelDraft((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const saveTravelDays = async () => {
    try {
      const dates = Array.from(travelDraft).sort();
      const res = await api.saveTravelDays(monday, dates);
      setTravelDays(res.data);
      setTravelEditorVisible(false);
    } catch {
      // ignore
    }
  };

  // 目标完成切换
  const toggleGoal = async (goal: Task) => {
    const next = goal.status === 'done' ? 'todo' : 'done';
    await api.updateTask(goal.id, { status: next });
    fetchWeekly();
  };

  // ---------- AI 对话（与首页一致） ----------
  const sendChat = (text: string) => {
    setChatVisible(true);
    const userMsg: ChatMsg = { role: 'user', content: text };
    const history = [...chatRef.current, userMsg];
    chatRef.current = [...history, { role: 'assistant', content: '' }];
    setChatMessages(chatRef.current);
    setChatStreaming(true);

    const sse = new RNSSE(`${API_BASE}/api/v1/chat/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, content: m.content })) }),
      pollingInterval: 0,
    });
    let acc = '';
    let createdCount = 0;
    sse.addEventListener('message', (event) => {
      const data = (event as { data?: string }).data ?? '';
      if (data === '[DONE]') {
        if (createdCount > 0) {
          setCreatedToast(`已为你安排 ${createdCount} 项任务`);
          setTimeout(() => setCreatedToast(null), 3800);
          fetchWeekly();
        }
        setChatStreaming(false);
        sse.close();
        return;
      }
      try {
        const j = JSON.parse(data);
        if (j.type === 'tasks_created' || j.type === 'schedule_synced') {
          createdCount = Number(j.count) || 0;
        } else if (j.text) {
          acc += j.text;
        } else if (j.error) {
          acc = acc || '抱歉，计划管家暂时无法回复。';
        }
      } catch {
        /* partial */
      }
      const next = [...chatRef.current];
      next[next.length - 1] = { role: 'assistant', content: acc };
      chatRef.current = next;
      setChatMessages(next);
    });
    sse.addEventListener('error', () => {
      setChatStreaming(false);
      sse.close();
    });
  };

  const doneGoals = goals.filter((g) => g.status === 'done').length;
  const travelWeekDayNames = useMemo(() => {
    return daysInPeriod
      .filter((d) => travelDays.includes(d))
      .map((d) => {
        const idx = daysInPeriod.indexOf(d);
        return WEEK_LABELS[idx];
      });
  }, [travelDays, daysInPeriod]);

  return (
    <Screen>
      <View className="flex-1">
        {/* 顶部标题 + 周期切换 */}
        <View className="px-4 pt-4 pb-2 bg-transparent">
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-[22px] font-bold text-gray-900">
                {period === 'next' ? '下周计划' : '本周计划'}
              </Text>
              <Text className="text-[12px] text-gray-400 mt-0.5">
                {dayjs(monday).format('M月D日')} - {dayjs(sunday).format('M月D日')}
              </Text>
            </View>
            <View className="bg-amber-50 rounded-full px-3 py-1.5 flex-row items-center">
              <FontAwesome6 name="bullseye" size={13} color="#D97706" />
              <Text className="text-[12px] font-semibold text-amber-700 ml-1.5">
                目标 {doneGoals}/{goals.length}
              </Text>
            </View>
          </View>
          {/* 周期切换器 */}
          <View className="bg-gray-100 rounded-full flex-row p-1">
            {(
              [
                { key: 'this', label: '本周' },
                { key: 'next', label: '下周' },
              ] as { key: Period; label: string }[]
            ).map((p) => {
              const active = period === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setPeriod(p.key)}
                  className="flex-1 py-2 rounded-full items-center"
                  style={{ backgroundColor: active ? '#4F46E5' : 'transparent' }}
                >
                  <Text className="text-[13px] font-semibold" style={{ color: active ? '#fff' : '#6B7280' }}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        ) : (
          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingBottom: 90 }}
            showsVerticalScrollIndicator={false}
          >
            {/* 出行日区 */}
            <View className="bg-white rounded-2xl px-4 py-3.5 mb-4"
              style={{ shadowColor: '#4F46E5', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <View className="w-8 h-8 rounded-xl bg-indigo-50 items-center justify-center">
                    <FontAwesome6 name="car-side" size={15} color="#4F46E5" />
                  </View>
                  <Text className="text-[15px] font-semibold text-gray-800">
                    {period === 'next' ? '下周出行日' : '本周出行日'}
                  </Text>
                </View>
                <TouchableOpacity onPress={openTravelEditor} className="px-3 py-1.5 rounded-full bg-indigo-50">
                  <Text className="text-[12px] font-semibold text-indigo-600">编辑</Text>
                </TouchableOpacity>
              </View>
              <View className="mt-2.5">
                {travelWeekDayNames.length > 0 ? (
                  <Text className="text-[14px] text-gray-600">
                    出行日：<Text className="text-indigo-600 font-semibold">{travelWeekDayNames.join('、')}</Text>
                  </Text>
                ) : (
                  <Text className="text-[13px] text-gray-400">本周无出行日</Text>
                )}
              </View>
            </View>

            {/* 目标区 */}
            <Text className="text-[13px] font-semibold text-gray-500 mb-2 flex-row items-center gap-1.5 px-1">
              <FontAwesome6 name="bullseye" size={12} color="#F59E0B" style={{ marginRight: 6 }} />
              {period === 'next' ? '下周核心目标' : '本周核心目标'}
            </Text>
            {goals.length === 0 ? (
              <View className="bg-amber-50 rounded-2xl px-5 py-6 items-center mb-4">
                <View className="w-12 h-12 rounded-2xl bg-amber-100 items-center justify-center mb-3">
                  <FontAwesome6 name="bullseye" size={20} color="#D97706" />
                </View>
                <Text className="text-[14px] text-gray-600 text-center leading-6">
                  {period === 'next'
                    ? '下周还没排，\n周日晚上跟我说一声就行'
                    : '本周还没有目标，\n周日晚上用一句话告诉我下周要冲什么'}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push('/task-detail', { type: 'goal', date: monday, week: period })
                  }
                  className="mt-4 px-5 py-2.5 rounded-full flex-row items-center"
                  style={{ backgroundColor: '#4F46E5' }}
                >
                  <FontAwesome6 name="plus" size={13} color="#fff" />
                  <Text className="text-white text-[13px] font-semibold ml-1.5">
                    {period === 'next' ? '添加下周目标' : '添加本周目标'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="mb-4">
                {goals.slice(0, 5).map((g) => {
                  const done = g.status === 'done';
                  const meta = TYPE_META[g.task_type];
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => toggleGoal(g)}
                      onLongPress={() => router.push('/task-detail', { id: g.id, type: 'goal' })}
                      delayLongPress={400}
                      className="bg-white rounded-2xl px-4 py-3.5 flex-row items-center mb-2 border"
                      style={{ borderColor: done ? '#D1FAE5' : '#F0F0F3', shadowColor: '#000', shadowOpacity: 0.03, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5 }}
                    >
                      <View
                        className="w-6 h-6 rounded-lg items-center justify-center mr-3 border"
                        style={{ backgroundColor: done ? '#F59E0B' : '#fff', borderColor: done ? '#F59E0B' : '#D1D5DB' }}
                      >
                        {done && <FontAwesome6 name="check" size={13} color="#fff" />}
                      </View>
                      <View className="flex-1 pr-2">
                        <Text
                          className={`text-[15px] font-medium ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}
                          numberOfLines={2}
                        >
                          {g.title}
                        </Text>
                      </View>
                      <View className="px-2 py-1 rounded-full" style={{ backgroundColor: `${meta.color}1F` }}>
                        <Text className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.name}</Text>
                      </View>
                      <Pressable
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation();
                          router.push('/task-detail', { id: g.id, type: 'goal', week: period });
                        }}
                        className="ml-2 items-center justify-center"
                        style={{ width: 16 }}
                      >
                        <FontAwesome6 name="chevron-right" size={12} color="#B0B7C3" />
                      </Pressable>
                    </Pressable>
                  );
                })}
                <TouchableOpacity
                  onPress={() =>
                    router.push('/task-detail', { type: 'goal', date: monday, week: period })
                  }
                  className="mt-1 py-3 rounded-2xl border border-dashed items-center"
                  style={{ borderColor: '#E5E7EB' }}
                >
                  <Text className="text-[13px] font-medium text-indigo-500">
                    {period === 'next' ? ' + 添加下周目标' : ' + 添加本周目标'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {/* 出行日编辑器 */}
        <Modal visible={travelEditorVisible} transparent animationType="slide" onRequestClose={() => setTravelEditorVisible(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={undefined}>
            <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
              <View className="bg-white rounded-t-3xl px-5 pt-5 pb-8">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-[17px] font-bold text-gray-900">
                    {period === 'next' ? '下周出行日' : '本周出行日'}
                  </Text>
                  <TouchableOpacity onPress={() => setTravelEditorVisible(false)} hitSlop={10} className="p-1">
                    <FontAwesome6 name="xmark" size={18} color="#4B5563" />
                  </TouchableOpacity>
                </View>
                <Text className="text-[13px] text-gray-500 mb-3">点击日期按钮，切换「工作日 / 出行日」</Text>
                <View className="flex-row flex-wrap gap-2">
                  {daysInPeriod.map((d, i) => {
                    const isTravel = travelDraft.has(d);
                    return (
                      <Pressable
                        key={d}
                        onPress={() => toggleTravelDraft(d)}
                        className="px-4 py-3 rounded-2xl items-center border"
                        style={{
                          backgroundColor: isTravel ? '#4F46E5' : '#F9FAFB',
                          borderColor: isTravel ? '#4F46E5' : '#EEF2FF',
                        }}
                      >
                        <Text className="text-[11px] font-medium" style={{ color: isTravel ? '#C7D2FE' : '#9CA3AF' }}>
                          {WEEK_LABELS[i]}
                        </Text>
                        <Text className="text-[13px] font-semibold mt-1" style={{ color: isTravel ? '#fff' : '#374151' }}>
                          {dayjs(d).format('D')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TouchableOpacity
                  onPress={saveTravelDays}
                  className="mt-6 py-3.5 rounded-2xl items-center"
                  style={{ backgroundColor: '#4F46E5' }}
                >
                  <Text className="text-white text-[15px] font-semibold">保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* 安排成功提示 */}
        {createdToast && (
          <View className="mx-4 mb-2 absolute bottom-[100] left-0 right-0">
            <View className="bg-emerald-500/95 rounded-full px-4 py-2.5 flex-row items-center">
              <FontAwesome6 name="wand-magic-sparkles" size={13} color="#FFFFFF" />
              <Text className="text-white text-[13px] flex-1 ml-2">{createdToast}</Text>
            </View>
          </View>
        )}

        {/* 常驻 AI 输入条 */}
        <ChatInputBar
          onSend={sendChat}
          onAdd={() => router.push('/task-detail', { date: todayG8() })}
        />

        {/* 对话浮层 */}
        <ChatOverlay
          visible={chatVisible}
          messages={chatMessages}
          streaming={chatStreaming}
          onSend={sendChat}
          onClose={() => setChatVisible(false)}
        />
      </View>
    </Screen>
  );
}