import { useRef, type ElementRef } from 'react';
import { Pressable, View, Text } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Task, TYPE_META } from '@/utils/api';

type SwipeableHandle = ElementRef<typeof ReanimatedSwipeable>;

interface Props {
  task: Task;
  isCurrent: boolean;
  onToggle: (t: Task) => void;
  onReschedule: (t: Task) => void;
  onTimeout: (t: Task) => void;
  onAbandon: (t: Task) => void;
  onDelete: (t: Task) => void;
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
export default function TaskRow({ task, isCurrent, onToggle, onReschedule, onTimeout, onAbandon, onDelete }: Props) {
  const swipeRef = useRef<SwipeableHandle | null>(null);
  const meta = TYPE_META[task.task_type];
  const done = task.status === 'done';
  const closeSwipe = () => swipeRef.current?.close();

  const renderRightActions = () => (
    <View className="flex-row rounded-2xl overflow-hidden" style={{ marginVertical: 6, marginLeft: 8 }}>
      <ActionBtn label="改期" color="#FFFFFF" bg="#4F46E5" onPress={() => { closeSwipe(); onReschedule(task); }} />
      <ActionBtn label="放弃" color="#FFFFFF" bg="#F97316" onPress={() => { closeSwipe(); onAbandon(task); }} />
      <ActionBtn label="删除" color="#FFFFFF" bg="#EF4444" onPress={() => { closeSwipe(); onDelete(task); }} />
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      renderRightActions={renderRightActions}
      overshootRight={false}
    >
      <Pressable
        onPress={() => onToggle(task)}
        onLongPress={() => onTimeout(task)}
        delayLongPress={400}
        className={`bg-white rounded-2xl px-3 py-3 flex-row items-center border ${isCurrent ? 'border-orange-200' : 'border-gray-100'}`}
        style={{ marginVertical: 4, shadowColor: isCurrent ? '#F97316' : '#000000', shadowOpacity: isCurrent ? 0.08 : 0.03, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1 }}
      >
        {/* 左侧当前时段竖线 */}
        {isCurrent && <View className="w-1 self-stretch rounded-full mr-2.5" style={{ backgroundColor: '#F97316' }} />}
        {!isCurrent && <View className="w-1 mr-2.5" />}

        {/* 时间段 */}
        <View className="w-[52px]">
          <Text className={`text-[13px] font-semibold ${done ? 'text-gray-400' : 'text-gray-800'}`}>{task.time_slot}</Text>
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

        {/* 完成态淡化 */}
        {done && <View className="absolute inset-0 bg-white rounded-2xl" style={{ opacity: 0.35 }} pointerEvents="none" />}
      </Pressable>
    </ReanimatedSwipeable>
  );
}