import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import dayjs from 'dayjs';
import BottomSheetModal from './BottomSheetModal';

interface Props {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSelect: (date: string) => void;
}

/** 改期：选择目标日期 */
export default function DatePickerSheet({ visible, current, onClose, onSelect }: Props) {
  const days = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const d = dayjs().subtract(1, 'day').add(i, 'day');
        return { date: d.format('YYYY-MM-DD'), label: d.date(), weekday: d.format('ddd') };
      }),
    []
  );

  return (
    <BottomSheetModal visible={visible} title="改期到" onClose={onClose}>
      <ScrollView style={{ flexGrow: 0 }}>
        <View className="flex-row flex-wrap gap-2">
          {days.map((d) => {
            const active = d.date === current;
            const isToday = d.date === dayjs().format('YYYY-MM-DD');
            return (
              <Pressable
                key={d.date}
                onPress={() => onSelect(d.date)}
                className={`w-[30%] items-center py-3 rounded-xl ${active ? 'bg-indigo-600' : 'bg-gray-100'}`}
              >
                <Text className={`text-xs ${active ? 'text-indigo-200' : 'text-gray-400'}`}>
                  {isToday ? '今天' : d.weekday}
                </Text>
                <Text className={`text-base font-bold mt-0.5 ${active ? 'text-white' : 'text-gray-800'}`}>
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </BottomSheetModal>
  );
}