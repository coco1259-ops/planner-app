import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { api, SCHEDULE_STAGES, ScheduleItem, ScheduleStage } from '@/utils/api';

// 自动计算"当前阶段"：第一个未完成的阶段
function currentStage(stages: ScheduleItem['stages']): ScheduleStage | null {
  for (const st of SCHEDULE_STAGES) {
    if (!stages?.[st]?.done) return st;
  }
  return null; // 全部完成
}

const TYPE_COLOR: Record<string, string> = { 商单: '#4F46E5', 科普选题: '#0EA5E9' };

export default function SchedulePage() {
  const router = useSafeRouter();
  const [list, setList] = useState<ScheduleItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async () => {
    try {
      const res = await api.listSchedule();
      setList(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchList();
    }, [fetchList])
  );

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* 标题 + 新建按钮 */}
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-xl font-bold text-gray-900">排期</Text>
          <Pressable
            onPress={() => router.push('/schedule-edit')}
            className="flex-row items-center bg-indigo-500 rounded-full px-4 py-2"
            style={{ shadowColor: '#4F46E5', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5 }}
          >
            <FontAwesome6 name="plus" size={13} color="#fff" />
            <Text className="text-white font-semibold text-[13px] ml-1">新建排期</Text>
          </Pressable>
        </View>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        ) : !list || list.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-gray-400 text-[14px]">还没有排期项目，点上面新建一条</Text>
          </View>
        ) : (
          list.map((item) => {
            const stage = currentStage(item.stages) ?? '发布';
            const typeColor = TYPE_COLOR[item.schedule_type] ?? '#6B7280';
            return (
              <Pressable
                key={item.id}
                onPress={() => router.push('/schedule-edit', { id: item.id })}
                className="bg-white rounded-2xl px-4 py-4 mb-3"
                style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}
              >
                <View className="flex-row items-start justify-between">
                  <Text className="text-[16px] font-bold text-gray-900 flex-1 pr-2">{item.project_name}</Text>
                  <View className="px-2 py-1 rounded-full" style={{ backgroundColor: `${typeColor}1F` }}>
                    <Text className="text-[11px] font-semibold" style={{ color: typeColor }}>{item.schedule_type}</Text>
                  </View>
                </View>

                {!!item.client_name && (
                  <Text className="text-[12px] text-gray-500 mt-1">客户：{item.client_name}</Text>
                )}

                <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <View className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full bg-indigo-500 mr-1.5" />
                    <Text className="text-[13px] font-semibold text-gray-800">当前：{stage}</Text>
                  </View>
                  <Text className="text-[12px] text-gray-400">
                    {item.pub_date ? `发布 ${dayjs(item.pub_date).format('M月D日')}` : '未定发布'}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}