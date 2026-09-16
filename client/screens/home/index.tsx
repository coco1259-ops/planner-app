import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import TaskRow from '@/components/TaskRow';
import TimePickerSheet from '@/components/TimePickerSheet';
import DatePickerSheet from '@/components/DatePickerSheet';
import ChatInputBar from '@/components/ChatInputBar';
import ChatOverlay, { ChatMsg } from '@/components/ChatOverlay';
import { api, Task } from '@/utils/api';
import RNSSE from 'react-native-sse';

const API_BASE = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? '').replace(/\/$/, '');
const todayStr = () => dayjs().format('YYYY-MM-DD');

export default function HomePage() {
  const [date, setDate] = useState<string>(todayStr());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // 撤销已完成
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const undoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 弹层
  const [timeSheetTask, setTimeSheetTask] = useState<Task | null>(null);
  const [dateSheetTask, setDateSheetTask] = useState<Task | null>(null);

  // 对话
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatRef = useRef<ChatMsg[]>([]);

  const fetchTasks = useCallback(async (d: string) => {
    try {
      const res = await api.listTasks(d);
      setTasks(res.data);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTasks(date);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date])
  );

  const stats = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'abandoned');
    return { done: active.filter((t) => t.status === 'done').length, total: active.length };
  }, [tasks]);

  const currentId = useMemo(() => {
    if (date !== todayStr()) return null;
    const now = dayjs().format('HH:mm');
    let cur: Task | null = null;
    for (const t of tasks) if (t.time_slot <= now) cur = t;
    return cur?.id ?? null;
  }, [tasks, date]);

  const shiftDate = (dir: number) => {
    setDate(dayjs(date).add(dir, 'day').format('YYYY-MM-DD'));
  };

  const clearUndo = () => {
    if (undoRef.current) clearTimeout(undoRef.current);
    setUndoTask(null);
  };

  const showUndo = (task: Task) => {
    if (undoRef.current) clearTimeout(undoRef.current);
    setUndoTask(task);
    undoRef.current = setTimeout(() => setUndoTask(null), 3000);
  };

  const toggleTask = async (task: Task) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    const res = await api.updateTask(task.id, { status: next });
    fetchTasks(date);
    if (next === 'done') showUndo(res.data);
    else clearUndo();
  };

  const undoDone = async () => {
    if (!undoTask) return;
    await api.updateTask(undoTask.id, { status: 'todo' });
    clearUndo();
    fetchTasks(date);
  };

  const changeTime = async (slot: string) => {
    if (!timeSheetTask) return;
    await api.updateTask(timeSheetTask.id, { time_slot: slot });
    setTimeSheetTask(null);
    fetchTasks(date);
  };

  const reschedule = async (d: string) => {
    if (!dateSheetTask) return;
    await api.updateTask(dateSheetTask.id, { plan_date: d });
    setDateSheetTask(null);
    fetchTasks(date);
    fetchTasks(d);
  };

  const abandonTask = async (task: Task) => {
    await api.updateTask(task.id, { status: 'abandoned' });
    fetchTasks(date);
  };

  const deleteTask = async (task: Task) => {
    await api.deleteTask(task.id);
    fetchTasks(date);
  };

  // ---------- AI 对话 ----------
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
    sse.addEventListener('message', (event) => {
      const data = (event as { data?: string }).data ?? '';
      if (data === '[DONE]') {
        setChatStreaming(false);
        sse.close();
        return;
      }
      try {
        const j = JSON.parse(data);
        if (j.text) {
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

  const dateLabel = useMemo(() => {
    if (date === todayStr()) return '今天';
    const d = dayjs(date);
    const diff = d.diff(dayjs(), 'day');
    return diff === -1 ? '昨天' : diff === 1 ? '明天' : dayjs(date).format('M月D日');
  }, [date]);

  return (
    <Screen>
      <View className="flex-1">
        {/* 头部：日期切换 + 进度 */}
        <View className="px-4 pt-4 bg-transparent">
          <View className="flex-row items-center justify-between bg-white rounded-2xl px-3 py-3"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}>
            <Pressable onPress={() => shiftDate(-1)} className="w-10 h-10 rounded-xl bg-gray-100 items-center justify-center">
              <FontAwesome6 name="chevron-left" size={16} color="#4B5563" />
            </Pressable>
            <View className="items-center">
              <Text className="text-[17px] font-bold text-gray-900">{dateLabel}</Text>
              <Text className="text-[12px] text-gray-400 mt-0.5">{dayjs(date).format('M月D日 dddd')}</Text>
            </View>
            <Pressable onPress={() => shiftDate(1)} className="w-10 h-10 rounded-xl bg-gray-100 items-center justify-center">
              <FontAwesome6 name="chevron-right" size={16} color="#4B5563" />
            </Pressable>
          </View>

          {/* 今日进度 */}
          <View className="flex-row items-center mt-3 px-1">
            <Text className="text-[13px] text-gray-500 mr-2">
              今日进度 <Text className="font-bold text-indigo-600">{stats.done}/{stats.total}</Text>
            </Text>
            <View className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{ width: `${stats.total ? Math.min(100, (stats.done / stats.total) * 100) : 0}%`, backgroundColor: '#4F46E5' }}
              />
            </View>
          </View>
        </View>

        {/* 任务列表 */}
        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#4F46E5" /></View>
        ) : tasks.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10">
            <FontAwesome6 name="calendar-day" size={40} color="#D1D5DB" />
            <Text className="text-gray-400 mt-3 text-center leading-6">这一天还没有安排</Text>
            <Text className="text-gray-400 text-center text-[13px] leading-5">点击下方输入条，让「计划管家」帮你排程</Text>
          </View>
        ) : (
          <FlatList
            className="flex-1 px-3 pt-3"
            data={tasks}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => (
              <TaskRow
                task={item}
                isCurrent={item.id === currentId}
                onToggle={toggleTask}
                onTimeout={setTimeSheetTask}
                onReschedule={setDateSheetTask}
                onAbandon={abandonTask}
                onDelete={deleteTask}
              />
            )}
            contentContainerStyle={{ paddingBottom: 12 }}
          />
        )}

        {/* 撤销 bar */}
        {undoTask && (
          <View className="mx-4 mb-2">
            <View className="bg-gray-900/90 rounded-full px-4 py-2.5 flex-row items-center">
              <FontAwesome6 name="check" size={13} color="#4ADE80" />
              <Text className="text-white text-[13px] flex-1 ml-2" numberOfLines={1}>已完成：{undoTask.title}</Text>
              <TouchableOpacity onPress={undoDone} className="px-3 py-1 rounded-full bg-white/20">
                <Text className="text-white text-[13px] font-semibold">撤销</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 常驻 AI 输入条 */}
        <ChatInputBar onSend={sendChat} />

        {/* 时间段弹层 */}
        <TimePickerSheet
          visible={!!timeSheetTask}
          current={timeSheetTask?.time_slot ?? '09:00'}
          onClose={() => setTimeSheetTask(null)}
          onSelect={changeTime}
        />

        {/* 改期弹层 */}
        <DatePickerSheet
          visible={!!dateSheetTask}
          current={dateSheetTask?.plan_date ?? date}
          onClose={() => setDateSheetTask(null)}
          onSelect={reschedule}
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