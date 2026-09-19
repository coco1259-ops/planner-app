import { useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Task, TYPE_META } from '@/utils/api';

interface Props {
  task: Task;
  isCurrent: boolean;
  onToggle: (t: Task) => void;
  onReschedule: (t: Task) => void;
  onTimeout: (t: Task) => void;
  onAbandon: (t: Task) => void;
  onDelete: (t: Task) => void;
  onOpenDetail: (t: Task) => void;
}

function ActionBtn({ label, color, bg, onPress }: { label: string; color: string; bg: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="items-center justify-center px-4"
      style={{ backgroundColor: bg, minWidth: 64 }}
    >
      <Text className="text-sm font-semibold" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 可左滑任务行（露出 改期/放弃/删除） */
export default function TaskRow({ task, isCurrent, onToggle, onReschedule, onTimeout, onAbandon, onDelete, onOpenDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[task.task_type];
  const done = task.status === 'done';

  const renderRightActions = () => (
    <View className="flex-row rounded-2xl overflow-hidden" style={{ marginVertical: 6, marginLeft: 8 }}>
      <ActionBtn label="改期" color="#FFFFFF" bg="#4F46E5" onPress={() => onReschedule(task)} />
      <ActionBtn label="放弃" color="#FFFFFF" bg="#F97316" onPress={() => onAbandon(task)} />
      <ActionBtn label="删除" color="#FFFFFF" bg="#EF4444" onPress={() => onDelete(task)} />
    </View>
  );

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      renderRightActions={renderRightActions}
      overshootRight={false}
    >
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        onLongPress={() => onTimeout(task)}
        delayLongPress={400}
        className={`bg-white rounded-2xl px-3 py-3 border ${isCurrent ? 'border-orange-200' : 'border-gray-100'}`}
        style={{ marginVertical: 4, shadowColor: isCurrent ? '#F97316' : '#000000', shadowOpacity: isCurrent ? 0.08 : 0.03, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1 }}
      >
        <View className="flex-row items-center">
          {/* 左侧勾选框：切换完成/未完成 */}
          <Pressable
            hitSlop={10}
            onPress={(e) => {
              e.stopPropagation();
              onToggle(task);
            }}
            className="mr-2.5 items-center justify-center"
            style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: done ? '#22C55E' : '#D1D5DB', backgroundColor: done ? '#22C55E' : '#fff' }}
          >
            {done && <FontAwesome6 name="check" size={13} color="#FFFFFF" />}
          </Pressable>

          {/* 左侧当前时段竖线 */}
          {isCurrent && <View className="w-1 self-stretch rounded-full mr-2.5" style={{ backgroundColor: '#F97316' }} />}
          {!isCurrent && <View className="w-1 mr-2.5" />}

          {/* 时间段 + 预计时长 */}
          <View className="w-[58px]">
            <Text className={`text-[13px] font-semibold ${done ? 'text-gray-400' : 'text-gray-800'}`}>{task.time_slot}</Text>
            {!!task.estimated_duration && (
              <Text numberOfLines={1} className={`text-[10px] mt-0.5 ${done ? 'text-gray-300' : 'text-gray-400'}`}>
                {task.estimated_duration}
              </Text>
            )}
          </View>

          {/* 中间内容 */}
          <View className="flex-1 pr-2">
            <Text
              numberOfLines={2}
              className={`text-[15px] font-medium ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}
            >
              {task.title}
            </Text>
            {!!task.remark && (
              <Text numberOfLines={2} className={`text-[11px] mt-0.5 ${done ? 'text-gray-300' : 'text-gray-400'}`}>
                {task.remark}
              </Text>
            )}
          </View>

          {/* 类型标签 */}
          <View className="px-2 py-1 rounded-full" style={{ backgroundColor: `${meta.color}1F` }}>
            <Text className="text-[11px] font-semibold" style={{ color: meta.color }}>
              {meta.name}
            </Text>
          </View>

          {/* 展开指示 */}
          <FontAwesome6 name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color="#C0C7D2" style={{ marginLeft: 8 }} />
        </View>

        {/* 内联详情（展开） */}
        {expanded && (
          <View className="mt-3 pt-3 border-t border-gray-100">
            <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
              {!!task.time_slot && (
                <View className="flex-row items-center">
                  <FontAwesome6 name="clock" size={11} color="#9CA3AF" />
                  <Text className="text-[13px] text-gray-700 ml-1.5">时间段：{task.time_slot}</Text>
                </View>
              )}
              <View className="flex-row items-center">
                <FontAwesome6 name="tag" size={11} color="#9CA3AF" />
                <Text className="text-[13px] text-gray-700 ml-1.5">类型：{meta.name}</Text>
              </View>
              {!!task.estimated_duration && (
                <View className="flex-row items-center">
                  <FontAwesome6 name="hourglass-half" size={11} color="#9CA3AF" />
                  <Text className="text-[13px] text-gray-700 ml-1.5">预计时长：{task.estimated_duration}</Text>
                </View>
              )}
              {!!task.remark && (
                <View className="flex-row items-start">
                  <FontAwesome6 name="comment" size={11} color="#9CA3AF" style={{ marginTop: 2 }} />
                  <Text className="text-[13px] text-gray-700 flex-1 ml-1.5" numberOfLines={0}>备注：{task.remark}</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onOpenDetail(task);
              }}
              className="self-end mt-2.5 px-4 py-2 rounded-full bg-indigo-50 items-center"
            >
              <Text className="text-[13px] font-semibold text-indigo-600">编辑</Text>
            </Pressable>
          </View>
        )}

        {/* 完成态淡化 */}
        {done && <View className="absolute inset-0 bg-white rounded-2xl" style={{ opacity: 0.35 }} pointerEvents="none" />}
      </Pressable>
    </ReanimatedSwipeable>
  );
}