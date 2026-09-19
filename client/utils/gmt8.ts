/**
 * 全 App 统一的 GMT+8 日期基准工具。
 *
 * 为什么需要：生产环境（Railway）服务器时区为 UTC，设备浏览器时区也可能并非 GMT+8。
 * 若用 dayjs()（跟随运行环境本地时区）计算"今天/明天/本周/下周"，
 * 会在 GMT+8 凌晨时段（如 9/19 00:30 时 UTC 仍为 9/18）产生整日偏差。
 * 这里所有接口都基于固定 +8 小时偏移的"墙钟时间"，保证任何环境结果一致。
 *
 * 约定：所有 date 字段与 Supabase 交互均为 "YYYY-MM-DD" 本地日期字符串，不做 UTC 转换。
 */
const G8_MS = 8 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** 当前 GMT+8 墙钟时间（作为 Date，其 toISOString 即 GMT+8 的日期时刻，用于统一取 UTC 分量） */
export const nowG8 = (): Date => new Date(Date.now() + G8_MS);

/** 今天（GMT+8） "YYYY-MM-DD" */
export const todayG8 = (): string => nowG8().toISOString().slice(0, 10);

/** 当前 GMT+8 墙钟时间 "HH:mm" */
export const nowG8Time = (): string =>
  nowG8().toISOString().slice(11, 16);

/** 某 date 加 n 天（n 可为负） */
export const addDaysG8 = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 今天（GMT+8）0 点起算，date 相对今天的整天差 */
export const diffDaysFromToday = (date: string): number => {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const todayMid = new Date(`${todayG8()}T00:00:00Z`).getTime();
  return Math.round((target - todayMid) / DAY_MS);
};

/** 中文星期几，输入 "YYYY-MM-DD" */
export const weekDayCnG8 = (date: string): string =>
  ['日', '一', '二', '三', '四', '五', '六'][new Date(`${date}T00:00:00Z`).getUTCDay()];

/** 本周周一（GMT+8） */
export const weekMondayG8 = (): string => {
  const d = nowG8();
  const sinceMon = (d.getUTCDay() + 6) % 7; // 周日=0 距周一的天数：6 时即周日
  return new Date(d.getTime() - sinceMon * DAY_MS).toISOString().slice(0, 10);
};

/** 本周周日（GMT+8），即周一 + 6 */
export const weekSundayG8 = (): string => addDaysG8(weekMondayG8(), 6);

/** 下周周一（GMT+8） */
export const nextMondayG8 = (): string => addDaysG8(weekMondayG8(), 7);

/** 下周周日（GMT+8） */
export const nextSundayG8 = (): string => addDaysG8(nextMondayG8(), 6);

/** 由归属周周一判断其属于本周还是下周 */
export const periodOfWeekG8 = (monday: string): 'this' | 'next' => {
  const thisMon = weekMondayG8();
  const prevMon = addDaysG8(thisMon, -7);
  return monday >= prevMon && monday < thisMon ? 'this' : monday === thisMon ? 'this' : 'next';
};