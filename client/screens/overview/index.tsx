import { useCallback, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { api } from '@/utils/api';

type OverviewData = Awaited<ReturnType<typeof api.overview>>;

function LineChart({ data }: { data: { label: string; count: number }[] }) {
  const W = 320;
  const H = 150;
  const pad = 28;
  const max = Math.max(1, ...data.map((d) => d.count));
  const points = data.map((d, i) => {
    const x = pad + (i * (W - pad * 2)) / (data.length - 1);
    const y = H - pad - (d.count / max) * (H - pad * 2 - 12);
    return { x, y, ...d };
  });
  const poly = points.map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#E5E7EB" strokeWidth={1} />
        {points.map((p, i) => (
          <SvgText key={`t${i}`} x={p.x} y={H - 8} fontSize={9} fill="#9CA3AF" textAnchor="middle">
            {p.label}
          </SvgText>
        ))}
        {points.map((p) => (
          <SvgText key={`v${p.x}`} x={p.x} y={p.y - 8} fontSize={10} fontWeight="700" fill="#4F46E5" textAnchor="middle">
            {p.count}
          </SvgText>
        ))}
        <Circle cx={pad} cy={H - pad} r={2.2} fill="#4F46E5" />
        <Polyline points={`${poly}`} fill="none" stroke="#4F46E5" strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => (
          <Circle key={`c${i}`} cx={p.x} cy={p.y} r={3} fill="#4F46E5" />
        ))}
      </Svg>
    </View>
  );
}

function DonutChart({
  data,
  size = 132,
  thickness = 22,
}: {
  data: { name: string; color: string; value: number }[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={thickness} />
      {total > 0 &&
        data.map((d, i) => {
          const seg = (d.value / total) * c;
          const el = (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
              strokeDasharray={`${seg} ${c - seg}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += seg;
          return el;
        })}
      <SvgText x={size / 2} y={size / 2 + 4} fontSize={15} fontWeight="bold" fill="#374151" textAnchor="middle">
        {total}
      </SvgText>
    </Svg>
  );
}

export default function OverviewPage() {
  const router = useSafeRouter();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pipeline, setPipeline] = useState<{ total: number; stages: { stage: string; count: number }[] } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.overview();
      setData(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
    try {
      const p = await api.schedulePipeline();
      setPipeline(p);
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const cards = useMemo(
    () => [
      { label: '计划总数', value: data?.total ?? 0, color: '#6B7280' },
      { label: '已完成', value: data?.done ?? 0, color: '#22C55E' },
      { label: '未做', value: data?.todo ?? 0, color: '#F97316' },
      { label: '今日计划', value: data?.today ?? 0, color: '#4F46E5' },
    ],
    [data]
  );

  if (loading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#4F46E5" /></View>
      </Screen>
    );
  }

  const maxStatus = Math.max(1, ...(data?.byStatus ?? []).map((s) => s.value));

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="text-xl font-bold text-gray-900 mb-4">概览</Text>

        {/* 四个数字卡片 */}
        <View className="flex-row flex-wrap justify-between">
          {cards.map((c) => (
            <View key={c.label} className="w-[48.5%] bg-white rounded-2xl px-4 py-4 mb-3"
              style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}>
              <Text className="text-[12px] text-gray-400">{c.label}</Text>
              <Text className="text-[30px] font-bold mt-1" style={{ color: c.color }}>{c.value}</Text>
            </View>
          ))}
        </View>

        {/* 内容管线统计（7天内到期的未完成阶段） */}
        <Pressable
          onPress={() => router.push('/schedule')}
          className="bg-white rounded-2xl px-4 py-4 mb-3"
          style={{ shadowColor: '#4F46E5', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-[14px] font-semibold text-gray-800">内容管线</Text>
            <Text className="text-[12px] text-indigo-500">查看排期 →</Text>
          </View>
          <Text className="text-[13px] mt-2 text-gray-700">
            {!pipeline || pipeline.total === 0
              ? '本周管线清爽'
              : pipeline.stages.map((s) => `${s.stage} ${s.count}`).join(' · ')}
          </Text>
        </Pressable>

        {/* 趋势折线图 */}
        <View className="bg-white rounded-2xl p-4 mb-3"
          style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}>
          <Text className="text-[14px] font-semibold text-gray-800 mb-3">近 7 日计划数趋势</Text>
          <LineChart data={data?.trend ?? []} />
        </View>

        {/* 类型分布 + 状态分布 */}
        <View className="flex-row flex-wrap justify-between mb-3">
          <View className="w-[48.5%] bg-white rounded-2xl p-4"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}>
            <Text className="text-[14px] font-semibold text-gray-800 mb-3">按类型</Text>
            <View className="items-center">
              <DonutChart data={(data?.byType ?? []).filter((t) => t.value > 0)} />
            </View>
            <View className="mt-3">
              {(data?.byType ?? []).map((t) => (
                <View key={t.key} className="flex-row items-center justify-between py-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                    <Text className="text-[12px] text-gray-500">{t.name}</Text>
                  </View>
                  <Text className="text-[12px] font-semibold text-gray-700">{t.value}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="w-[48.5%] bg-white rounded-2xl p-4"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}>
            <Text className="text-[14px] font-semibold text-gray-800 mb-3">按状态</Text>
            {(data?.byStatus ?? []).map((s) => (
              <View key={s.key} className="mb-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[12px] text-gray-500">{s.name}</Text>
                  <Text className="text-[13px] font-bold" style={{ color: s.color }}>{s.value}</Text>
                </View>
                <View className="h-2.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                  <View className="h-full rounded-full" style={{ width: `${(s.value / maxStatus) * 100}%`, backgroundColor: s.color }} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}