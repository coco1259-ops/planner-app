/**
 * 服务端统一 GMT+8 日期基准工具。
 * 生产服务器（Railway）时区为 UTC，若用 dayjs()/new Date() 直接取本地日期
 * 会在 GMT+8 凌晨时段偏差一天。这里所有接口固定 +8 偏移墙钟，保证与业务时区一致。
 * 约定：所有 date 字段与 Supabase 交互均为 "YYYY-MM-DD" 本地日期字符串。
 */
const G8_MS = 8 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** 当前 GMT+8 墙钟时间（Date，其 UTC 分量即 GMT+8 日期时刻） */
export const nowG8 = (): Date => new Date(Date.now() + G8_MS);

/** 今天 "YYYY-MM-DD"（GMT+8） */
export const todayG8 = (): string => nowG8().toISOString().slice(0, 10);

/** 相对今天加 n 天（GMT+8） */
export const addDaysG8 = (n: number): string => {
  const d = nowG8();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 本周周一（GMT+8），作为归属周 week_key */
export const weekMondayG8 = (): string => {
  const d = nowG8();
  const sinceMon = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMon * DAY_MS).toISOString().slice(0, 10);
};

/** 生成最近 7 天（含今天）的日期数组（GMT+8），用于统计趋势 */
export const lastWeekDaysG8 = (): string[] =>
  Array.from({ length: 7 }, (_, i) => addDaysG8(i - 6));