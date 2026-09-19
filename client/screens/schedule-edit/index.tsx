import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { Screen } from '@/components/Screen';
import { SmartDateInput } from '@/components/SmartDateInput';
import { FontAwesome6 } from '@expo/vector-icons';
import { api, SCHEDULE_STAGES, ScheduleItem, SchedulePayload, ScheduleStage, ScheduleType } from '@/utils/api';
import { shareImageFromDataUrl } from '@/utils/shareImage';
import { renderScheduleImageCanvas } from '@/utils/scheduleImage';

const TYPE_OPTIONS: ScheduleType[] = ['商单', '科普选题'];
const TYPE_COLOR: Record<string, string> = { 商单: '#4F46E5', 科普选题: '#0EA5E9' };

export default function ScheduleEditPage() {
  const router = useSafeRouter();
  const { id } = useSafeSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [projectName, setProjectName] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('商单');
  const [clientName, setClientName] = useState('');
  const [pubDate, setPubDate] = useState<string | null>(null);
  const [stages, setStages] = useState<Partial<Record<ScheduleStage, { date?: string | null; done?: boolean }>>>({});

  // 加载编辑数据
  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getSchedule(id);
        if (cancelled) return;
        const d = res.data;
        setProjectName(d.project_name);
        setScheduleType(d.schedule_type);
        setClientName(d.client_name ?? '');
        setPubDate(d.pub_date ?? null);
        setStages(d.stages ?? {});
      } catch {
        if (!cancelled) Alert.alert('提示', '加载项目失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  // 更新某阶段字段
  const updateStage = (name: ScheduleStage, patch: { date?: string | null; done?: boolean }) => {
    setStages((prev) => ({ ...prev, [name]: { ...(prev[name] ?? {}), ...patch } }));
  };

  const handleSave = async () => {
    if (!projectName.trim()) {
      Alert.alert('提示', '请填写项目名称');
      return;
    }
    const payload: SchedulePayload = {
      project_name: projectName.trim(),
      schedule_type: scheduleType,
      client_name: clientName.trim(),
      pub_date: pubDate,
      stages,
    };
    try {
      setSaving(true);
      if (isEdit && id) {
        await api.updateSchedule(id, payload);
      } else {
        await api.createSchedule(payload);
      }
      router.back();
    } catch {
      Alert.alert('提示', '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    Alert.alert('删除项目', '确定删除这个排期项目吗？此操作不可撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true);
            await api.deleteSchedule(id);
            router.back();
          } catch {
            Alert.alert('提示', '删除失败');
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const buildStageList = useCallback(() => {
    return SCHEDULE_STAGES.map((name) => {
      const s = stages[name] ?? {};
      return { name, date: s.date ?? null, done: !!s.done };
    });
  }, [stages]);

  // 生成排期图 → 系统分享面板（可发微信/保存）
  const handleGenerateImage = async () => {
    if (!projectName.trim()) {
      Alert.alert('提示', '请先填写项目名称再生成排期图');
      return;
    }
    try {
      setGenerating(true);
      const dataUrl = renderScheduleImageCanvas({
        projectName: projectName.trim(),
        scheduleType,
        clientName: clientName.trim(),
        pubDate,
        stages: buildStageList(),
      });
      const fileName = `排期图_${projectName.trim()}_${scheduleType}.png`;
      await shareImageFromDataUrl(dataUrl, fileName);
    } catch {
      Alert.alert('提示', '生成排期图失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#4F46E5" /></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* 顶栏 */}
        <View className="flex-row items-center justify-between mb-4">
          <Pressable onPress={() => router.back()} className="flex-row items-center px-1">
            <FontAwesome6 name="arrow-left" size={17} color="#374151" />
            <Text className="text-gray-700 text-[15px] ml-2">{isEdit ? '排期详情' : '新建排期'}</Text>
          </Pressable>
        </View>

        {/* 基本信息 */}
        <View className="bg-white rounded-2xl p-4 mb-3" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}>
          <Text className="text-[13px] font-semibold text-gray-500 mb-1.5">项目名称</Text>
          <TextInput
            value={projectName}
            onChangeText={setProjectName}
            placeholder="请输入项目名称"
            placeholderTextColor="#9CA3AF"
            className="bg-gray-50 rounded-xl px-3 py-3 text-[15px] text-gray-900 mb-3"
          />

          <Text className="text-[13px] font-semibold text-gray-500 mb-1.5">类型</Text>
          <View className="flex-row mb-3">
            {TYPE_OPTIONS.map((t) => {
              const active = scheduleType === t;
              const color = TYPE_COLOR[t];
              return (
                <Pressable
                  key={t}
                  onPress={() => setScheduleType(t)}
                  className="px-3 py-2 rounded-full mr-2 border"
                  style={active ? { backgroundColor: `${color}1F`, borderColor: color } : { borderColor: '#E5E7EB' }}
                >
                  <Text className="text-[13px] font-semibold" style={{ color: active ? color : '#6B7280' }}>{t}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-[13px] font-semibold text-gray-500 mb-1.5">客户名（商单填写）</Text>
          <TextInput
            value={clientName}
            onChangeText={setClientName}
            placeholder="客户名（科普选题可留空）"
            placeholderTextColor="#9CA3AF"
            className="bg-gray-50 rounded-xl px-3 py-3 text-[15px] text-gray-900 mb-3"
          />

          <Text className="text-[13px] font-semibold text-gray-500 mb-1.5">发布日期</Text>
          <SmartDateInput value={pubDate} onChange={(v) => setPubDate(v)} placeholder="选择发布日期" />
        </View>

        {/* 8 阶段时间线 */}
        <Text className="text-[14px] font-bold text-gray-900 mb-2">阶段时间线</Text>
        {SCHEDULE_STAGES.map((name, idx) => {
          const s = stages[name] ?? {};
          const done = !!s.done;
          const isCurrent = !done && (idx === 0 || !!stages[SCHEDULE_STAGES[idx - 1]]?.done);
          return (
            <View key={name} className="flex-row mb-2">
              {/* 时间线轨道 */}
              <View className="w-8 items-center">
                <View
                  className="w-6 h-6 rounded-full items-center justify-center border-2"
                  style={done ? { borderColor: '#22C55E', backgroundColor: '#22C55E' } : isCurrent ? { borderColor: '#4F46E5', backgroundColor: '#4F46E5' } : { borderColor: '#D1D5DB' }}
                >
                  {done ? (
                    <Text className="text-white text-[11px] font-bold">✓</Text>
                  ) : isCurrent ? (
                    <Text className="text-white text-[11px] font-bold">{idx + 1}</Text>
                  ) : null}
                </View>
                {idx < SCHEDULE_STAGES.length - 1 && <View className="w-0.5 flex-1 bg-gray-200" style={{ minHeight: 30 }} />}
              </View>

              {/* 阶段内容 */}
              <View className="flex-1 ml-2 mb-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[15px] font-semibold" style={{ color: done ? '#22C55E' : isCurrent ? '#4F46E5' : '#374151' }}>
                    {name}
                    {isCurrent && <Text className="text-[11px] text-indigo-500 ml-2">（当前）</Text>}
                  </Text>
                  <Pressable
                    onPress={() => updateStage(name, { done: !done })}
                    className="flex-row items-center px-2.5 py-1.5 rounded-full border"
                    style={done ? { backgroundColor: '#22C55E1F', borderColor: '#22C55E' } : { borderColor: '#D1D5DB' }}
                  >
                    <Text className="text-[12px] font-semibold" style={{ color: done ? '#16A34A' : '#6B7280' }}>
                      {done ? '已完成' : '未完成'}
                    </Text>
                  </Pressable>
                </View>
                <View className="mt-1.5">
                  <SmartDateInput
                    value={s.date ?? null}
                    onChange={(v) => updateStage(name, { date: v })}
                    placeholder="选择计划日期"
                  />
                </View>
              </View>
            </View>
          );
        })}

        {/* 生成排期图 */}
        {isEdit && (
          <>
            <Pressable
              disabled={generating}
              onPress={handleGenerateImage}
              className="flex-row items-center justify-center rounded-xl py-3.5 mb-3"
              style={{ backgroundColor: '#4F46E5', shadowColor: '#4F46E5', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}
            >
              <FontAwesome6 name="image" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text className="text-white font-bold text-[15px]">{generating ? '生成中...' : '生成排期图'}</Text>
            </Pressable>

            </>
        )}

        {/* 删除 */}
        {isEdit && (
          <Pressable
            disabled={deleting}
            onPress={handleDelete}
            className="flex-row items-center justify-center rounded-xl py-3 mb-3 border border-red-200"
            style={{ backgroundColor: '#FEF2F2' }}
          >
            <Text className="text-red-500 font-semibold text-[14px]">{deleting ? '删除中...' : '删除'}</Text>
          </Pressable>
        )}

        <Pressable
          disabled={saving}
          onPress={handleSave}
          className="bg-indigo-500 rounded-xl py-3.5 items-center mb-3"
          style={{ shadowColor: '#4F46E5', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}
        >
          <Text className="text-white font-bold text-[15px]">{saving ? '保存中...' : isEdit ? '保存修改' : '保存'}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}