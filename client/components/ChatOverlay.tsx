import { useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import ChatInputBar from './ChatInputBar';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  visible: boolean;
  messages: ChatMsg[];
  streaming: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}

/** 计划管家对话浮层 */
export default function ChatOverlay({ visible, messages, streaming, onSend, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#F6F6F8' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View className="px-4 flex-row items-center justify-between bg-white" style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}>
          <View className="flex-row items-center gap-2.5">
            <View className="w-9 h-9 rounded-xl bg-indigo-100 items-center justify-center">
              <FontAwesome6 name="wand-magic-sparkles" size={16} color="#4F46E5" />
            </View>
            <View>
              <Text className="text-[16px] font-bold text-gray-900">计划管家</Text>
              <Text className="text-[11px] text-gray-400">智能排程助手</Text>
            </View>
          </View>
          <Pressable onPress={onClose} className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center">
            <FontAwesome6 name="xmark" size={16} color="#4B5563" />
          </Pressable>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-4"
          contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View className="items-center pt-20">
              <Text className="text-gray-400 text-sm text-center leading-6">
                把今天要做的事告诉我，{'\n'}我来帮你排好一天的时间安排
              </Text>
            </View>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <View key={i} className="self-end max-w-[82%]">
                <View className="bg-indigo-600 rounded-2xl rounded-br-md px-4 py-2.5">
                  <Text className="text-white text-[15px] leading-6">{m.content}</Text>
                </View>
              </View>
            ) : (
              <View key={i} className="self-start max-w-[88%]">
                {i === 0 && null}
                <View className="bg-white rounded-2xl rounded-bl-md px-4 py-2.5" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 4 }}>
                  <Text className="text-gray-800 text-[15px] leading-6">
                    {m.content}
                    {streaming && i === messages.length - 1 && <ActivityIndicator size="small" color="#4F46E5" />}
                  </Text>
                </View>
              </View>
            )
          )}
        </ScrollView>

        {/* 输入条 */}
        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInputBar onSend={onSend} placeholder="继续补充安排…" />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}