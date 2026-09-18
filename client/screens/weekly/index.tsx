import { useCallback, useMemo, useRef, useState } from 'react';
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
import RNSSE from 'react-native-sse';

const API_BASE = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? '').replace(/\/$/, '');

// 本周周一日期
const WEEK_MONDAY = () => dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD');
// 本周周日日期
const WEEK_SUNDAY = () => dayjs().startOf('week').add(7, 'day').format('YYYY-MM-DD');

const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function weekDays(): string[] {
  const monday = dayjs().startOf('week').add(1, 'day');
  return Array.from({ length: 7 }, (_, i) => monday.add(i, 'day').format('YYYY-MM-DD'));
}

export default function WeeklyPage() {
  const router = useSafeRouter();

  // 出行日
  const [travelDays, setTravelDays] = useState<string[]>([]);
  const [travelEditorVisible, setTravelEditorVisible] = useState(false);
  const [travelDraft, setTravelDraft] = useState<Set<string>>(new Set());

  // 本周目标
  const [goals, setGoals] = useState<Task[]>([]);
  // 未完成任务
  const [incomplete, setIncomplete] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // 对话
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatRef = useRef<ChatMsg[]>([]);
  const [createdToast, setCreatedToast] = useState<string | null>(null);

  const monday = WEEK_MONDAY();
  const sunday = WEEK_SUNDAY();
  const daysThisWeek = useMemo(() => weekDays(), []);

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
      // 本周目标：指定周内 task_type=goal（plan_date 落于本周）
      const goalRes = await api.listRange(monday, sunday, undefined);
      const all = goalRes.data;
      setGoals(all.filter((t) => t.task_type === 'goal'));
      // 未完成任务：当前周 status=todo 且非目标
      const todoRes = await api.listRange(monday, sunday, 'todo');
      setIncomplete(todoRes.data.filter((t) => t.task_type !== 'goal'));
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
        if (j.type === 'tasks_created') {
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
    return daysThisWeek
      .filter((d) => travelDays.includes(d))
      .map((d) => {
        const idx = daysThisWeek.indexOf(d);
        return WEEK_LABELS[idx];
      });
  }, [travelDays, daysThisWeek]);

  return (
    <Screen>
      <View className="flex-1">
        {/* 顶部标题 */}
        <View className="px-4 pt-4 pb-2 bg-transparent">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[22px] font-bold text-gray-900">本周计划</Text>
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
                  <Text className="text-[15px] font-semibold text-gray-800">本周出行日</Text>
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

            {/* 本周目标区 */}
            <Text className="text-[13px] font-semibold text-gray-500 mb-2 flex-row items-center gap-1.5 px-1">
              <FontAwesome6 name="bullseye" size={12} color="#F59E0B" style={{ marginRight: 6 }} />
              本周核心目标
            </Text>
            {goals.length === 0 ? (
              <View className="bg-amber-50 rounded-2xl px-5 py-6 items-center mb-4">
                <View className="w-12 h-12 rounded-2xl bg-amber-100 items-center justify-center mb-3">
                  <FontAwesome6 name="bullseye" size={20} color="#D97706" />
                </View>
                <Text className="text-[14px] text-gray-600 text-center leading-6">
                  本周还没有目标，{'\n'}周日晚上用一句话告诉我下周要冲什么
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/task-detail', { type: 'goal', date: monday })}
                  className="mt-4 px-5 py-2.5 rounded-full flex-row items-center"
                  style={{ backgroundColor: '#4F46E5' }}
                >
                  <FontAwesome6 name="plus" size={13} color="#fff" />
                  <Text className="text-white text-[13px] font-semibold ml-1.5">添加本周目标</Text>
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
                          router.push('/task-detail', { id: g.id, type: 'goal' });
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
                  onPress={() => router.push('/task-detail', { type: 'goal', date: monday })}
                  className="mt-1 py-3 rounded-2xl border border-dashed items-center"
                  style={{ borderColor: '#E5E7EB' }}
                >
                  <Text className="text-[13px] font-medium text-indigo-500"> + 添加本周目标</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 未完成聚合区 */}
            <View className="flex-row items-center gap-2 px-1 mb-2 mt-1">
              <FontAwesome6 name="hourglass-half" size={12} color="#F97316" />
              <Text className="text-[13px] font-semibold text-gray-500">未完成的任务</Text>
              <View className="flex-1 h-px bg-gray-200" />
              <Text className="text-[11px] text-gray-400">{incomplete.length} 项</Text>
            </View>
            {incomplete.length === 0 ? (
              <View className="bg-emerald-50 rounded-2xl px-5 py-6 items-center mb-4">
                <FontAwesome6 name="party-horn" size={22} color="#059669" />
                <Text className="text-[14px] text-gray-600 mt-2.5">这一周都完成了 🎉</Text>
              </View>
            ) : (
              <View className="mb-4">
                {incomplete.map((t) => {
                  const meta = TYPE_META[t.task_type];
                  const label = t.plan_date === dayjs().format('YYYY-MM-DD') ? '今天' :
                    dayjs(t.plan_date).format('周' + ['日', '一', '二', '三', '四', '五', '六'][dayjs(t.plan_date).day()]);
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => router.push('/task-detail', { id: t.id })}
                      className="bg-white rounded-2xl px-4 py-3 flex-row items-center mb-2 border"
                      style={{ borderColor: '#F0F0F3', shadowColor: '#000', shadowOpacity: 0.03, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5 }}
                    >
                      <View className="w-[64px]">
                        <Text className="text-[11px] text-gray-400">{label}</Text>
                        <Text className="text-[14px] font-semibold text-gray-800 mt-0.5">{t.time_slot}</Text>
                        {!!t.estimated_duration && (
                          <Text className="text-[10px] text-gray-400 mt-0.5">{t.estimated_duration}</Text>
                        )}
                      </View>
                      <View className="flex-1 pr-2">
                        <Text className="text-[15px] font-medium text-gray-900" numberOfLines={2}>{t.title}</Text>
                        {!!t.remark && <Text className="text-[11px] text-gray-400 mt-0.5" numberOfLines={1}>{t.remark}</Text>}
                      </View>
                      <View className="px-2 py-1 rounded-full" style={{ backgroundColor: `${meta.color}1F` }}>
                        <Text className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.name}</Text>
                      </View>
                      <View className="ml-1.5 items-center justify-center" style={{ width: 16 }}>
                        <FontAwesome6 name="chevron-right" size={12} color="#B0B7C3" />
                      </View>
                    </Pressable>
                  );
                })}
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
                  <Text className="text-[17px] font-bold text-gray-900">本周出行日</Text>
                  <TouchableOpacity onPress={() => setTravelEditorVisible(false)} hitSlop={10} className="p-1">
                    <FontAwesome6 name="xmark" size={18} color="#4B5563" />
                  </TouchableOpacity>
                </View>
                <Text className="text-[13px] text-gray-500 mb-3">点击日期按钮，切换「工作日 / 出行日」</Text>
                <View className="flex-row flex-wrap gap-2">
                  {daysThisWeek.map((d, i) => {
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
          onAdd={() => router.push('/task-detail', { date: dayjs().format('YYYY-MM-DD') })}
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