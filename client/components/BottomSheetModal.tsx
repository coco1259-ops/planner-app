import { ReactNode } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** 通用底部弹层（用于时间段/日期等选择） */
export default function BottomSheetModal({ visible, title, onClose, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} style={{ justifyContent: 'flex-end' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-white rounded-t-3xl pt-5 pb-8 px-5"
          style={{ maxHeight: '75%' }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base font-bold text-gray-900">{title}</Text>
            <Pressable onPress={onClose} className="w-8 h-8 items-center justify-center bg-gray-100 rounded-full">
              <FontAwesome6 name="xmark" size={15} color="#4B5563" />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}