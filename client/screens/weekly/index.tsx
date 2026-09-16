import { View, Text } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';

export default function WeeklyPage() {
  return (
    <Screen>
      <View className="flex-1 items-center justify-center px-12">
        <View className="w-20 h-20 rounded-3xl bg-indigo-100 items-center justify-center">
          <FontAwesome6 name="calendar-week" size={34} color="#4F46E5" />
        </View>
        <Text className="text-xl font-bold text-gray-900 mt-5">周计划 · 开发中</Text>
        <Text className="text-gray-400 text-center leading-6 mt-2">
          周视图功能正在建设中，{'\n'}敬请期待后续版本
        </Text>
      </View>
    </Screen>
  );
}