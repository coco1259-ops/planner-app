import { useCallback, useMemo, useState } from 'react';
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
import dayjs from 'dayjs';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { api, TaskType, TaskStatus, TYPE_META, TYPE_ORDER } from '@/utils/api';

// 兼容单个时间（09:00）与时间段范围（4:00-7:00）
// eslint-disable-next-line regexp/no-unused-capturing-group
const TIME_PATTERN = /^\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TODAY = () => dayjs().format('YYYY-MM-DD');

export default function TaskDetailPage() {
  const router = useSafeRouter();
  const { id, date } = useSafeSearchParams<{ id?: string; date?: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [remark, setRemark] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [duration, setDuration] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('deep');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [planDate, setPlanDate] = useState(date || TODAY());

  const load = useCallback(async () => {
    if (!isEdit || !id) return;
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
  }, [id, isEdit]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 类型选项：新 5 类；若编辑的旧数据不在选项中，则追加保留以正确回显
  const typeOptions = useMemo<(TaskType)[]>(() => {
    const list: TaskType[] = [...TYPE_ORDER];
    if (taskType && !list.includes(taskType)) {
      list.unshift(taskType);
    }
    return list;
  }, [taskType]);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('提示', '事项不能为空');
      return;
    }
    if (!DATE_PATTERN.test(planDate)) {
      Alert.alert('提示', '日期格式应为 YYYY-MM-DD，例如 2026-09-18');
      return;
    }
    const finalSlot = timeSlot.trim() ? timeSlot.trim() : '09:00';
    if (!TIME_PATTERN.test(finalSlot)) {
      Alert.alert('提示', '时间段格式应为 09:00 或 4:00-7:00');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: trimmed,
        remark: remark.trim() || null,
        plan_date: planDate,
        time_slot: finalSlot,
        estimated_duration: duration.trim() || null,
        task_type: taskType,
      };
      if (isEdit && id) {
        await api.updateTask(id, { ...payload, status });
      } else {
        await api.createTask(payload);
      }
      router.back();
    } catch (e) {
      Alert.alert('错误', '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEdit || !id) return;
    Alert.alert('删除任务', '确定要删除这条任务吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTask(id);
            router.back();
          } catch (e) {
            Alert.alert('错误', '删除失败，请重试');
          }
        },
      },
    ]);
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
          {isEdit ? '任务详情' : '新增任务'}
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
            <Text className="text-white text-[14px] font-semibold">{isEdit ? '保存修改' : '保存'}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
        {/* 事项 */}
        <Text className="text-[13px] font-medium text-gray-500 mb-1.5">
          事项<Text className="text-red-500"> *</Text>
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="要做什么"
          selectionColorClassName="accent-indigo-500"
          className="bg-gray-100 rounded-2xl px-4 py-3.5 text-[16px] text-gray-900"
        />

        {/* 日期 + 预计时长 */}
        <View className="flex-row gap-3 mt-4">
          <View className="flex-1">
            <Text className="text-[13px] font-medium text-gray-500 mb-1.5">日期</Text>
            <TextInput
              value={planDate}
              onChangeText={setPlanDate}
              placeholder="YYYY-MM-DD"
              selectionColorClassName="accent-indigo-500"
              className="bg-gray-100 rounded-2xl px-4 py-3.5 text-[16px] text-gray-900"
            />
          </View>
          <View className="flex-1">
            <Text className="text-[13px] font-medium text-gray-500 mb-1.5">预计时长</Text>
            <TextInput
              value={duration}
              onChangeText={setDuration}
              placeholder="如 45分钟 / 1小时"
              selectionColorClassName="accent-indigo-500"
              className="bg-gray-100 rounded-2xl px-4 py-3.5 text-[16px] text-gray-900"
            />
          </View>
        </View>

        {/* 时间段 */}
        <Text className="text-[13px] font-medium text-gray-500 mb-1.5 mt-4">时间段</Text>
        <TextInput
          value={timeSlot}
          onChangeText={setTimeSlot}
          placeholder="如 09:00 或 4:00-7:00"
          selectionColorClassName="accent-indigo-500"
          className="bg-gray-100 rounded-2xl px-4 py-3.5 text-[16px] text-gray-900"
        />

        {/* 类型 */}
        <Text className="text-[13px] font-medium text-gray-500 mb-1.5 mt-4">类型</Text>
        <View className="flex-row flex-wrap gap-2">
          {typeOptions.map((t) => {
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

        {/* 状态（仅编辑显示） */}
        {isEdit && (
          <>
            <Text className="text-[13px] font-medium text-gray-500 mb-1.5 mt-4">状态</Text>
            <View className="flex-row rounded-2xl overflow-hidden border border-gray-200">
              {(['todo', 'done', 'abandoned'] as TaskStatus[]).map((s) => {
                const active = s === status;
                const bg = s === 'done' ? '#22C55E' : s === 'abandoned' ? '#EF4444' : '#4F46E5';
                const label = s === 'todo' ? '未做' : s === 'done' ? '已完成' : '已放弃';
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(s)}
                    className="flex-1 py-3 items-center"
                    style={{ backgroundColor: active ? bg : '#fff' }}
                  >
                    <Text className="text-[13px] font-semibold" style={{ color: active ? '#fff' : '#6B7280' }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

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

        {/* 底部操作 */}
        {isEdit && (
          <Pressable
            onPress={handleDelete}
            className="mt-6 rounded-2xl border border-red-200 py-3.5 items-center"
            style={{ backgroundColor: '#FFF1F2' }}
          >
            <Text className="text-[15px] font-semibold text-red-500">删除</Text>
          </Pressable>
        )}
        <View className="h-8" />
      </ScrollView>
    </Screen>
  );
}