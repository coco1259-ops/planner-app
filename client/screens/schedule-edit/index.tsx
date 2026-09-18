import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { Screen } from '@/components/Screen';
import { SmartDateInput } from '@/components/SmartDateInput';
import { FontAwesome6 } from '@expo/vector-icons';
import { api, SCHEDULE_STAGES, ScheduleItem, SchedulePayload, ScheduleStage, ScheduleType } from '@/utils/api';

const TYPE_OPTIONS: ScheduleType[] = ['商单', '科普选题'];
const TYPE_COLOR: Record<string, string> = { 商单: '#4F46E5', 科普选题: '#0EA5E9' };

// 将 base64 xlsx 转为 Blob（仅 Web 端使用）
function base64ToBlob(b64: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export default function ScheduleEditPage() {
  const router = useSafeRouter();
  const { id } = useSafeSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const triggerDownload = useCallback((url: string, fileName: string) => {
    // 仅 Web 端执行（PWA 主屏幕访问）；后端返回签名 URL，用 fetch+blob 触发下载
    if (Platform.OS !== 'web') return;
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        window.open(url, '_blank');
      });
  }, []);

  // 导出 Excel 并分享 / 降级下载
  const handleExport = async () => {
    try {
      setExporting(true);
      const { downloadUrl, fileName, base64 } = await api.exportSchedule();
      const finalUrl =
        downloadUrl ||
        (base64 && Platform.OS === 'web'
          ? URL.createObjectURL(base64ToBlob(base64))
          : '');
      if (!finalUrl) {
        if (Platform.OS !== 'web') {
          Alert.alert('导出成功', `文件已生成：${fileName}\n数据已编码，请在网页端使用`);
        } else {
          Alert.alert('提示', '导出失败，请重试');
        }
        return;
      }
      // Web 端优先尝试系统分享面板（可发微信等）
      if (Platform.OS === 'web') {
        const nav: any = (globalThis as any).navigator;
        if (typeof nav?.share === 'function') {
          try {
            await nav.share({ title: '内容排期表', text: '内容排期表已导出', url: finalUrl });
            return;
          } catch (shareErr: any) {
            if (shareErr?.name === 'AbortError') return;
            triggerDownload(finalUrl, fileName);
          }
        } else {
          triggerDownload(finalUrl, fileName);
        }
      } else {
        Alert.alert('导出成功', `文件已生成：${fileName}\n请在网页端打开，或使用分享下载：\n${finalUrl}`);
      }
    } catch {
      Alert.alert('提示', '导出失败，请重试');
    } finally {
      setExporting(false);
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

        {/* 操作按钮 */}
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

        <Pressable
          disabled={exporting}
          onPress={handleExport}
          className="bg-gray-800 rounded-xl py-3.5 items-center"
        >
          <Text className="text-white font-bold text-[15px]">{exporting ? '导出中...' : '导出Excel并发送'}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}