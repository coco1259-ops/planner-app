import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import DatePickerSheet from '@/components/DatePickerSheet';
import { api, Task, TYPE_META } from '@/utils/api';

type Row = { type: 'header'; date: string } | { type: 'item'; task: Task };

export default function IncompletePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dateSheet, setDateSheet] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.listIncomplete();
      setTasks(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDate = '';
    for (const t of tasks) {
      if (t.plan_date !== lastDate) {
        lastDate = t.plan_date;
        out.push({ type: 'header', date: lastDate });
      }
      out.push({ type: 'item', task: t });
    }
    return out;
  }, [tasks]);

  const dayLabel = (d: string) => {
    const today = dayjs().format('YYYY-MM-DD');
    const diff = dayjs(d).diff(dayjs(), 'day');
    if (d === today) return '今天';
    if (diff === -1) return '昨天';
    if (diff === 1) return '明天';
    const wd = ['日', '一', '二', '三', '四', '五', '六'][dayjs(d).day()];
    return `${dayjs(d).format('M月D日')} · 周${wd}`;
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelect = () => setSelected(new Set());

  const batchAbandon = async () => {
    await api.batch(Array.from(selected), 'abandon');
    clearSelect();
    fetchData();
  };

  const batchReschedule = async (d: string) => {
    await api.batch(Array.from(selected), 'reschedule', d);
    setDateSheet(false);
    clearSelect();
    fetchData();
  };

  const renderHeader = (date: string) => (
    <View className="pt-4 pb-2 px-4 flex-row items-center gap-2">
      <Text className="text-[13px] font-bold text-gray-500">{dayLabel(date)}</Text>
      <View className="flex-1 h-px bg-gray-200" />
      <Text className="text-[11px] text-gray-300">
        {tasks.filter((t) => t.plan_date === date).length} 项
      </Text>
    </View>
  );

  const renderItem = (task: Task) => {
    const isSel = selected.has(task.id);
    const meta = TYPE_META[task.task_type];
    return (
      <Pressable
        onPress={() => toggleSelect(task.id)}
        className="mx-3 my-1 bg-white rounded-2xl px-3 py-3 flex-row items-center"
        style={isSel ? { borderWidth: 1.5, borderColor: '#4F46E5' } : { borderWidth: 1, borderColor: '#F0F0F3' }}
      >
        <View
          className="w-6 h-6 rounded-lg items-center justify-center mr-3"
          style={{ backgroundColor: isSel ? '#4F46E5' : '#F3F4F6' }}
        >
          {isSel && <FontAwesome6 name="check" size={13} color="#FFFFFF" />}
        </View>
        <View className="w-[44px]">
          <Text className="text-[13px] font-semibold text-gray-700">{task.time_slot}</Text>
          {!!task.estimated_duration && (
            <Text className="text-[10px] text-gray-400 mt-0.5">{task.estimated_duration}</Text>
          )}
        </View>
        <View className="flex-1 pr-2">
          <Text className="text-[15px] font-medium text-gray-900" numberOfLines={2}>{task.title}</Text>
          {!!task.remark && <Text className="text-[11px] text-gray-400 mt-0.5" numberOfLines={2}>{task.remark}</Text>}
        </View>
        <View className="px-2 py-1 rounded-full" style={{ backgroundColor: `${meta.color}1F` }}>
          <Text className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.name}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen>
      <View className="flex-1">
        {/* 头部 */}
        <View className="px-4 pt-4 items-center justify-between flex-row">
          <Text className="text-xl font-bold text-gray-900">未完成</Text>
          <View className="bg-orange-100 px-3 py-1.5 rounded-full">
            <Text className="text-[13px] font-semibold text-orange-600">共 {tasks.length} 项</Text>
          </View>
        </View>
        <Text className="px-4 pt-1 text-[12px] text-gray-400">勾选多条后，可一键改期或放弃</Text>

        {/* 列表 */}
        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#4F46E5" /></View>
        ) : tasks.length === 0 ? (
          <View className="flex-1 items-center justify-center px-12">
            <FontAwesome6 name="check-double" size={40} color="#D1D5DB" />
            <Text className="text-gray-400 mt-3 text-center">太棒了，没有未完成的任务</Text>
          </View>
        ) : (
          <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
            {rows.map((r) =>
              r.type === 'header' ? (
                <View key={r.date}>{renderHeader(r.date)}</View>
              ) : (
                <View key={r.task.id}>{renderItem(r.task)}</View>
              )
            )}
          </ScrollView>
        )}

        {/* 批量操作条 */}
        {selected.size > 0 && (
          <View className="absolute left-0 right-0 bottom-4 px-4">
            <View className="bg-gray-900 rounded-2xl px-4 py-3 flex-row items-center gap-3">
              <Text className="text-white font-semibold flex-1">已选 {selected.size} 项</Text>
              <Pressable onPress={() => setDateSheet(true)} className="bg-white/20 px-4 py-2 rounded-xl">
                <Text className="text-white text-[13px] font-semibold">改期</Text>
              </Pressable>
              <Pressable onPress={batchAbandon} className="bg-orange-500 px-4 py-2 rounded-xl">
                <Text className="text-white text-[13px] font-semibold">放弃</Text>
              </Pressable>
              <Pressable onPress={clearSelect} className="w-8 h-8 items-center justify-center">
                <FontAwesome6 name="xmark" size={15} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        )}

        {/* 改期弹层 */}
        <DatePickerSheet
          visible={dateSheet}
          current={dayjs().format('YYYY-MM-DD')}
          onClose={() => setDateSheet(false)}
          onSelect={batchReschedule}
        />
      </View>
    </Screen>
  );
}