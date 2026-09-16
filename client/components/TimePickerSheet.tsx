import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import BottomSheetModal from './BottomSheetModal';

interface Props {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSelect: (timeSlot: string) => void;
}

function buildSlots(): string[] {
  const slots: string[] = [];
  for (let h = 7; h <= 23; h++) {
    for (const m of ['00', '30']) {
      slots.push(`${String(h).padStart(2, '0')}:${m}`);
    }
  }
  return slots;
}

/** 时间段选择（长按任务行时弹出） */
export default function TimePickerSheet({ visible, current, onClose, onSelect }: Props) {
  const slots = useMemo(() => buildSlots(), []);
  return (
    <BottomSheetModal visible={visible} title="选择时间段" onClose={onClose}>
      <ScrollView style={{ flexGrow: 0 }}>
        <View className="flex-row flex-wrap gap-2">
          {slots.map((slot) => {
            const active = slot === current;
            return (
              <Pressable
                key={slot}
                onPress={() => onSelect(slot)}
                className={`px-4 py-2.5 rounded-xl ${active ? 'bg-indigo-600' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-700'}`}>{slot}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </BottomSheetModal>
  );
}