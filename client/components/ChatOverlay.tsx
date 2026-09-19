import { useEffect, useRef, useState } from 'react';
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

/**
 * Web/PWA 端键盘高度监听：
 * iOS Safari/standalone PWA 弹起键盘时 visualViewport 高度缩小，
 * 用其差值估算键盘高度，把浮层底部抬起，保证输入框固定在键盘正上方，
 * 同时消息区被压缩但仍可见（可滚动）。
 */
function useWebKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof globalThis === 'undefined') return;
    const g = globalThis as any;
    const vv = g.visualViewport;
    if (!vv || typeof vv.addEventListener !== 'function') return;

    let raf = 0;
    const compute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const innerH: number = typeof g.innerHeight === 'number' ? g.innerHeight : vv.height;
        const visualH: number = vv.height;
        // visualViewport.height 即键盘上方可见区域高度，间距即键盘高度
        const kb = Math.max(0, Math.round(innerH - visualH));
        setHeight(kb);
      });
    };

    vv.addEventListener('resize', compute);
    vv.addEventListener('scroll', compute);
    compute();
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', compute);
      vv.removeEventListener('scroll', compute);
    };
  }, []);

  return height;
}

/** 计划管家对话浮层 */
export default function ChatOverlay({ visible, messages, streaming, onSend, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardHeight = useWebKeyboardHeight();
  const isWeb = Platform.OS === 'web';
  // 键盘弹起时底部不再额外叠加安全区（键盘本身已占位）
  const keyboardGap = isWeb ? keyboardHeight : 0;

  useEffect(() => {
    if (visible) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, visible]);

  // 键盘弹起瞬间再滚动一次到底部，确保最新一条（尤其 AI 提问）可见
  useEffect(() => {
    if (keyboardGap > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
    }
  }, [keyboardGap]);

  const body = (
    <>
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

      {/* Messages：flex:1 被键盘压缩但始终可见可滚动 */}
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

      {/* 输入条：键盘弹起时通过 paddingBottom 抬起，固定在键盘正上方 */}
      <View style={{ paddingBottom: keyboardGap > 0 ? 0 : insets.bottom }}>
        <ChatInputBar onSend={onSend} placeholder="继续补充安排…" multiline />
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {isWeb ? (
        // Web/PWA 端：KeyboardAvoidingView 不生效，改用 visualViewport 高度自适应
        <View style={{ flex: 1, backgroundColor: '#F6F6F8', paddingBottom: keyboardGap }}>{body}</View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: '#F6F6F8' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}