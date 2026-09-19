import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Keyboard,
  Platform,
} from 'react-native';
import dayjs from 'dayjs';
import { FontAwesome6 } from '@expo/vector-icons';

interface SmartDateInputProps {
  label?: string;           // 表单标题 (可选)
  value?: string | null;    // 日期字符串 (ISO 8601 或 YYYY-MM-DD)
  onChange?: (date: string) => void; // 回调给父组件的值，格式为 YYYY-MM-DD
  placeholder?: string;
  displayFormat?: string;   // UI展示的格式，默认 YYYY-MM-DD
  error?: string;

  // 样式自定义（可选）
  containerStyle?: object;
  inputStyle?: object;
  textStyle?: object;
  labelStyle?: object;
  placeholderTextStyle?: object;
  errorTextStyle?: object;
  iconColor?: string;
  iconSize?: number;
}

const WEEK_HEADERS = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 自绘日期选择器（跨端一致）。
 * - 点击输入框弹出底部日历面板（React Native Modal，三端均可用，不依赖平台原生 picker）
 * - 默认定位到当前月份；选中后回填显示，再次点击可修改，支持清除
 * - 兼容 iOS / Android / Web(PWA)
 */
export const SmartDateInput = ({
  label,
  value,
  onChange,
  placeholder = '请选择',
  displayFormat,
  error,
  containerStyle,
  inputStyle,
  textStyle,
  labelStyle,
  placeholderTextStyle,
  errorTextStyle,
  iconColor,
  iconSize = 18,
}: SmartDateInputProps) => {
  const [visible, setVisible] = useState(false);
  // 日历面板当前浏览的年月（默认当前月份；若有值则定位到值所在月份）
  const [viewYear, setViewYear] = useState<number>(() => (value ? dayjs(value).year() : dayjs().year()));
  const [viewMonth, setViewMonth] = useState<number>(() => (value ? dayjs(value).month() : dayjs().month()));

  const format = displayFormat || 'YYYY-MM-DD';
  const parsedValue = useMemo(() => {
    if (!value) return null;
    const d = dayjs(value);
    return d.isValid() ? d : null;
  }, [value]);

  const displayString = parsedValue ? parsedValue.format(format) : '';

  const open = () => {
    Keyboard.dismiss();
    // 打开时若已有值，定位到值所在月份；否则当前月份
    const base = parsedValue || dayjs();
    setViewYear(base.year());
    setViewMonth(base.month());
    setVisible(true);
  };

  const handlePick = (dateStr: string) => {
    setVisible(false);
    if (onChange) onChange(dateStr);
  };

  const handleClear = () => {
    setVisible(false);
    if (onChange) onChange('');
  };

  // 当月日历格子：前置空格 + 每天日期
  const cells = useMemo(() => {
    const firstDay = dayjs(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`);
    const daysInMonth = firstDay.daysInMonth();
    const leading = firstDay.day(); // 0=周日
    const out: (string | null)[] = Array(leading).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(dayjs(firstDay).date(d).format('YYYY-MM-DD'));
    }
    return out;
  }, [viewYear, viewMonth]);

  const todayStr = dayjs().format('YYYY-MM-DD');
  const selectedStr = parsedValue ? parsedValue.format('YYYY-MM-DD') : '';

  const changeMonth = (delta: number) => {
    const m = dayjs(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`).add(delta, 'month');
    setViewYear(m.year());
    setViewMonth(m.month());
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={[styles.label, labelStyle]}>{label}</Text>}

      <TouchableOpacity
        style={[styles.inputBox, error ? styles.inputBoxError : null, inputStyle]}
        onPress={open}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.text, textStyle, !value && styles.placeholder, !value && placeholderTextStyle]}
          numberOfLines={1}
        >
          {displayString || placeholder}
        </Text>
        <FontAwesome6
          name="calendar"
          size={iconSize}
          color={iconColor || (value ? '#4B5563' : '#9CA3AF')}
          style={styles.icon}
        />
      </TouchableOpacity>

      {error && <Text style={[styles.errorText, errorTextStyle]}>{error}</Text>}

      {/* 底部日历弹层（跨端可用） */}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setVisible(false)} style={{ justifyContent: 'flex-end' }}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl pt-5 pb-8 px-4"
          >
            {/* 头部：关闭 + 清除 */}
            <View className="flex-row items-center justify-between mb-3 px-1">
              <Pressable onPress={handleClear} hitSlop={8}>
                <Text className="text-[14px] text-gray-400">清除</Text>
              </Pressable>
              <Text className="text-base font-bold text-gray-900">选择日期</Text>
              <Pressable onPress={() => setVisible(false)} className="w-8 h-8 items-center justify-center bg-gray-100 rounded-full">
                <FontAwesome6 name="xmark" size={15} color="#4B5563" />
              </Pressable>
            </View>

            {/* 年月 + 前后切换 */}
            <View className="flex-row items-center justify-between px-1 mb-2">
              <Pressable onPress={() => changeMonth(-1)} className="w-9 h-9 items-center justify-center rounded-full bg-gray-100">
                <FontAwesome6 name="chevron-left" size={14} color="#4B5563" />
              </Pressable>
              <Text className="text-[15px] font-bold text-gray-800">
                {viewYear}年{viewMonth + 1}月
              </Text>
              <Pressable onPress={() => changeMonth(1)} className="w-9 h-9 items-center justify-center rounded-full bg-gray-100">
                <FontAwesome6 name="chevron-right" size={14} color="#4B5563" />
              </Pressable>
            </View>

            {/* 星期表头 */}
            <View className="flex-row mb-1">
              {WEEK_HEADERS.map((w) => (
                <View key={w} className="flex-1 items-center py-1.5">
                  <Text className="text-[12px] text-gray-400">{w}</Text>
                </View>
              ))}
            </View>

            {/* 日期格子 */}
            <View className="flex-row flex-wrap">
              {cells.map((d, i) => {
                if (!d) {
                  return <View key={`b${i}`} className="w-[14.28%] aspect-square items-center justify-center" />;
                }
                const isSelected = d === selectedStr;
                const isToday = d === todayStr;
                return (
                  <Pressable
                    key={d}
                    onPress={() => handlePick(d)}
                    className="w-[14.28%] aspect-square items-center justify-center rounded-full"
                    style={{ backgroundColor: isSelected ? '#4F46E5' : 'transparent' }}
                  >
                    <Text
                      className="text-[15px]"
                      style={{
                        color: isSelected ? '#fff' : isToday ? '#4F46E5' : '#374151',
                        fontWeight: isSelected || isToday ? '700' : '400',
                      }}
                    >
                      {Number(d.slice(8, 10))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// 设计样式
const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginLeft: 2,
  },
  inputBox: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  inputBoxError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  text: {
    fontSize: 16,
    color: '#111827',
    flex: 1,
  },
  placeholder: {
    color: '#9CA3AF',
  },
  icon: {
    marginLeft: 12,
  },
  errorText: {
    marginTop: 4,
    marginLeft: 2,
    fontSize: 12,
    color: '#EF4444',
  },
});