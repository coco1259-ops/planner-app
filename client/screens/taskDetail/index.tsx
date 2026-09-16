import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { api, Task, TaskType, TaskStatus, TYPE_META, TYPE_ORDER, STATUS_META } from '@/utils/api';

// eslint-disable-next-line regexp/no-useless-non-capturing-group
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):(?:[0-5]\d)$/;

export default function TaskDetailPage() {
  const router = useSafeRouter();
  const { id } = useSafeSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [remark, setRemark] = useState('');
  const [timeSlot, setTimeSlot] = useState('09:00');
  const [duration, setDuration] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('light');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [planDate, setPlanDate] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.getTask(id);
      const t = res.data;
      setTitle(t.title);
      setRemark(t.remark ?? '');
      setTimeSlot(t.time_slot);
      setDuration(t.estimated_duration ?? '');
      setTaskType(t.task_type);
      setStatus(t.status);
      setPlanDate(t.plan_date);
    } catch (e) {
      Alert.alert('错误', '加载任务失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('提示', '事项不能为空');
      return;
    }
    if (!TIME_PATTERN.test(timeSlot)) {
      Alert.alert('提示', '时间段格式应为 HH:MM，例如 09:00');
      return;
    }
    if (!id) return;
    setSaving(true);
    try {
      await api.updateTask(id, {
        title: trimmed,
        remark: remark.trim() || null,
        time_slot: timeSlot,
        estimated_duration: duration.trim() || null,
        task_type: taskType,
        status,
      });
      router.back();
    } catch (e) {
      Alert.alert('错误', '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4F46E5" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* 顶栏 */}
      <View className="flex-row items-center px-2 py-2 border-b border-gray-100 bg-white">
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} className="p-2">
          <FontAwesome6 name="arrow-left" size={18} color="#374151" />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[17px] font-semibold text-gray-900">
          任务详情
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-full"
          style={{ backgroundColor: saving ? '#A5B4FC' : '#4F46E5' }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-[14px] font-semibold">保存</Text>
          )}
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
        {/* 事项 */}
        <Text className="text-[13px] font-medium text-gray-500 mb-1.5">事项</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="要做什么"
          selectionColorClassName="accent-indigo-500"
          className="bg-gray-100 rounded-2xl px-4 py-3.5 text-[16px] text-gray-900"
        />

        {/* 时间段 + 预计时长 */}
        <View className="flex-row gap-3 mt-4">
          <View className="flex-1">
            <Text className="text-[13px] font-medium text-gray-500 mb-1.5">时间段</Text>
            <TextInput
              value={timeSlot}
              onChangeText={setTimeSlot}
              placeholder="09:00"
              selectionColorClassName="accent-indigo-500"
              className="bg-gray-100 rounded-2xl px-4 py-3.5 text-[16px] text-gray-900"
            />
          </View>
          <View className="flex-1">
            <Text className="text-[13px] font-medium text-gray-500 mb-1.5">预计时长</Text>
            <TextInput
              value={duration}
              onChangeText={setDuration}
              placeholder="如 30分钟 / 1小时"
              selectionColorClassName="accent-indigo-500"
              className="bg-gray-100 rounded-2xl px-4 py-3.5 text-[16px] text-gray-900"
            />
          </View>
        </View>

        {/* 类型 */}
        <Text className="text-[13px] font-medium text-gray-500 mb-1.5 mt-4">类型</Text>
        <View className="flex-row gap-2">
          {TYPE_ORDER.map((t) => {
            const meta = TYPE_META[t];
            const active = t === taskType;
            return (
              <Pressable
                key={t}
                onPress={() => setTaskType(t)}
                className="px-4 py-2 rounded-full border"
                style={{
                  backgroundColor: active ? `${meta.color}1F` : '#fff',
                  borderColor: active ? meta.color : '#E5E7EB',
                }}
              >
                <Text className="text-[13px] font-semibold" style={{ color: meta.color }}>
                  {meta.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 状态 */}
        <Text className="text-[13px] font-medium text-gray-500 mb-1.5 mt-4">状态</Text>
        <View className="flex-row rounded-2xl overflow-hidden border border-gray-200">
          {(['todo', 'done', 'abandoned'] as TaskStatus[]).map((s) => {
            const active = s === status;
            const meta = STATUS_META[s];
            return (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                className="flex-1 py-3 items-center"
                style={{ backgroundColor: active ? (s === 'done' ? '#22C55E' : s === 'abandoned' ? '#EF4444' : '#4F46E5') : '#fff' }}
              >
                <Text className="text-[13px] font-semibold" style={{ color: active ? '#fff' : '#6B7280' }}>
                  {meta.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 备注 */}
        <Text className="text-[13px] font-medium text-gray-500 mb-1.5 mt-4">备注</Text>
        <TextInput
          value={remark}
          onChangeText={setRemark}
          placeholder="补充说明…"
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          selectionColorClassName="accent-indigo-500"
          className="bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] text-gray-900"
          style={{ minHeight: 110 }}
        />

        <Text className="text-[12px] text-gray-400 mt-3">
          日期：{planDate || '--'}
        </Text>
        <View className="h-8" />
      </ScrollView>
    </Screen>
  );
}