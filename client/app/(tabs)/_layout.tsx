import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [background, muted, accent, border] = useCSSVariable([
    '--color-background',
    '--color-muted',
    '--color-accent',
    '--color-border',
  ]) as string[];

  let tabBarStyle: any = {
    backgroundColor: background,
    borderTopWidth: 1,
    borderTopColor: border,
    height: 58 + insets.bottom,
    paddingBottom: insets.bottom,
    paddingTop: 6,
  };

  // 用于修复 Web 上高度异常的问题（这个 if 逻辑必须添加）
  if (Platform.OS === 'web') {
    tabBarStyle = {
      ...tabBarStyle,
      height: 58 + insets.bottom,
    };
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '日计划',
          tabBarIcon: ({ color }) => <FontAwesome6 name="list-check" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="incomplete"
        options={{
          title: '未完成',
          tabBarIcon: ({ color }) => <FontAwesome6 name="clipboard-list" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="overview"
        options={{
          title: '概览',
          tabBarIcon: ({ color }) => <FontAwesome6 name="chart-pie" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="weekly"
        options={{
          title: '周计划',
          tabBarIcon: ({ color }) => <FontAwesome6 name="calendar-week" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: '排期',
          tabBarIcon: ({ color }) => <FontAwesome6 name="table-cells" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}