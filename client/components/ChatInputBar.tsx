import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useVoiceInput } from '@/hooks/useVoiceInput';

interface Props {
  onSend: (text: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

/** 常驻 AI 对话输入条：左侧语音按钮 + 文字输入框 + 发送 */
export default function ChatInputBar({ onSend, autoFocus, placeholder }: Props) {
  const [text, setText] = useState('');
  // 语音识别完成后自动发送：说出计划 → 直接交给计划管家执行
  const { recording, processing, start, stop } = useVoiceInput((result) => {
    const t = (result ?? '').trim();
    if (!t) return;
    setText('');
    onSend(t);
  });
  const canShowSend = text.trim().length > 0 || recording || processing;

  const handleSend = () => {
    const v = text.trim();
    if (!v) return;
    setText('');
    onSend(v);
  };

  return (
    <View
      className="px-3 py-2 bg-white"
      style={{
        borderTopWidth: 1,
        borderTopColor: '#F0F0F3',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: -2 },
        shadowRadius: 8,
      }}
    >
      <View className="flex-row items-center gap-2">
        {/* 左侧语音按钮 */}
        <Pressable
          onPress={recording ? stop : start}
          disabled={processing}
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ backgroundColor: recording ? '#EF4444' : '#EEF2FF' }}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#4F46E5" />
          ) : (
            <FontAwesome6 name={recording ? 'stop' : 'microphone'} size={19} color={recording ? '#FFFFFF' : '#4F46E5'} />
          )}
        </Pressable>

        {/* 文字输入框 */}
        <View className="flex-1 rounded-2xl px-3.5 bg-gray-100 h-12 justify-center">
          <TextInput
            className="text-[15px] text-gray-900 py-2"
            placeholderTextColor="#9CA3AF"
            placeholder={recording ? '正在录音，再点一次结束…' : placeholder ?? '和计划管家聊聊安排…'}
            value={text}
            autoFocus={autoFocus}
            onChangeText={setText}
            multiline={false}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            onKeyPress={(e) => {
              if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter') {
                handleSend();
              }
            }}
          />
        </View>

        {/* 发送按钮 */}
        {canShowSend ? (
          <Pressable
            onPress={handleSend}
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: '#4F46E5' }}
          >
            <FontAwesome6 name="arrow-up" size={18} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View className="w-12" />
        )}
      </View>
    </View>
  );
}