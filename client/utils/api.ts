/**
 * 全局 API 工具与共享类型
 * 后端 Base URL 统一使用 EXPO_PUBLIC_BACKEND_BASE_URL（系统注入）
 */
const API_BASE = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? '').replace(/\/$/, '');

export type TaskType =
  | 'work'
  | 'childcare'
  | 'chores'
  | 'personal'
  | 'study'
  | 'deep'
  | 'light'
  | 'family'
  | 'goal'
  | 'life';
export type TaskStatus = 'todo' | 'done' | 'abandoned';

export interface Task {
  id: string;
  title: string;
  remark: string | null;
  task_type: TaskType;
  plan_date: string; // YYYY-MM-DD
  week_key?: string | null; // 归属周（该周周一），用于"目标"类型按周过滤
  time_slot: string; // HH:MM
  estimated_duration?: string | null; // 如 "30分钟" / "1小时"
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

// 统一为 4 类：深度 / 轻度 / 个人 / 学习
// 旧类型（work/childcare/chores/family）归一映射到新类，保证历史数据统一显示：
//   work(工作)      -> deep   (深度)
//   childcare(带娃) -> light  (轻度)
//   chores(家务)    -> light  (轻度)
//   family(家庭)    -> personal(个人)
// 颜色：深度使用醒目的红橙色，其余（轻度绿 / 个人紫 / 学习青）协调统一
export const TYPE_META: Record<TaskType, { name: string; color: string }> = {
  // 新 4 类（主类型）
  deep: { name: '深度', color: '#EF4444' },
  light: { name: '轻度', color: '#22C55E' },
  personal: { name: '个人', color: '#A855F7' },
  study: { name: '学习', color: '#14B8A6' },
  life: { name: '生活', color: '#F59E0B' },
  // 旧类型归一映射（保持历史数据回显一致）
  work: { name: '深度', color: '#EF4444' },
  childcare: { name: '轻度', color: '#22C55E' },
  chores: { name: '轻度', color: '#22C55E' },
  family: { name: '个人', color: '#A855F7' },
  // 本周目标
  goal: { name: '目标', color: '#F59E0B' },
};

// 新建/编辑时的可选类型：深度 / 轻度 / 个人 / 学习 / 生活
export const TYPE_ORDER: TaskType[] = ['deep', 'light', 'personal', 'study', 'life'];

export const STATUS_META: Record<TaskStatus, { name: string; color: string }> = {
  todo: { name: '未做', color: '#F97316' },
  done: { name: '已完成', color: '#22C55E' },
  abandoned: { name: '已放弃', color: '#9CA3AF' },
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: options?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!resp.ok) {
    let message = `请求失败(${resp.status})`;
    try {
      const body = await resp.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await resp.json()) as T;
}

export const api = {
  listTasks: (date: string) =>
    request<{ data: Task[] }>(`/api/v1/tasks?date=${date}`),

  listIncomplete: () => request<{ data: Task[] }>('/api/v1/tasks/incomplete'),

  /**
   * 服务端文件：server/src/routes/tasks.ts
   * 接口：GET /api/v1/tasks/range
   * Query 参数：start: string (YYYY-MM-DD), end: string (YYYY-MM-DD), status?: 'todo', weekKey?: string (该周周一)
   */
  listRange: (start: string, end: string, status?: 'todo', weekKey?: string) =>
    request<{ data: Task[] }>(
      `/api/v1/tasks/range?start=${start}&end=${end}${status ? `&status=${status}` : ''}${
        weekKey ? `&weekKey=${weekKey}` : ''
      }`,
    ),

  getTask: (id: string) => request<{ data: Task }>(`/api/v1/tasks/${id}`),

  createTask: (payload: Partial<Task> & { title: string; plan_date: string }) =>
    request<{ data: Task }>('/api/v1/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTask: (id: string, payload: Partial<Task>) =>
    request<{ data: Task }>(`/api/v1/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/tasks/${id}`, { method: 'DELETE' }),

  batch: (ids: string[], action: 'reschedule' | 'abandon' | 'done' | 'todo', plan_date?: string) =>
    request<{ ok: boolean; updated: number }>('/api/v1/tasks/batch', {
      method: 'POST',
      body: JSON.stringify({ ids, action, plan_date: plan_date ?? undefined }),
    }),

  overview: () =>
    request<{
      total: number;
      done: number;
      todo: number;
      abandoned: number;
      today: number;
      byType: { name: string; key: TaskType; color: string; value: number }[];
      byStatus: { name: string; key: TaskStatus; color: string; value: number }[];
      trend: { date: string; label: string; count: number }[];
    }>('/api/v1/stats/overview'),

  /**
   * 服务端文件：server/src/routes/travel-days.ts
   * 接口：GET /api/v1/travel-days
   * Query 参数：weekKey: string (该周周一日期)
   */
  getTravelDays: (weekKey: string) =>
    request<{ data: string[] }>(`/api/v1/travel-days?weekKey=${weekKey}`),

  /**
   * 服务端文件：server/src/routes/travel-days.ts
   * 接口：POST /api/v1/travel-days
   * Body 参数：weekKey: string, dates: string[]
   */
  saveTravelDays: (weekKey: string, dates: string[]) =>
    request<{ data: string[] }>('/api/v1/travel-days', {
      method: 'POST',
      body: JSON.stringify({ weekKey, dates }),
    }),

  /**
   * 服务端文件：server/src/routes/schedule.ts
   * 接口：GET /api/v1/schedule
   */
  listSchedule: () => request<{ data: ScheduleItem[] }>('/api/v1/schedule'),

  /**
   * 服务端文件：server/src/routes/schedule.ts
   * 接口：GET /api/v1/schedule/:id
   * Path 参数：id: string
   */
  getSchedule: (id: string) => request<{ data: ScheduleItem }>(`/api/v1/schedule/${id}`),

  /**
   * 服务端文件：server/src/routes/schedule.ts
   * 接口：POST /api/v1/schedule
   * Body 参数：见 SchedulePayload
   */
  createSchedule: (payload: SchedulePayload) =>
    request<{ data: ScheduleItem }>('/api/v1/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /**
   * 服务端文件：server/src/routes/schedule.ts
   * 接口：PUT /api/v1/schedule/:id
   * Path 参数：id: string, Body 见 SchedulePayload(partial)
   */
  updateSchedule: (id: string, payload: SchedulePayload) =>
    request<{ data: ScheduleItem }>(`/api/v1/schedule/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  /**
   * 服务端文件：server/src/routes/schedule.ts
   * 接口：DELETE /api/v1/schedule/:id
   * Path 参数：id: string
   */
  deleteSchedule: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/schedule/${id}`, { method: 'DELETE' }),

  /**
   * 服务端文件：server/src/routes/schedule-export.ts
   * 接口：GET /api/v1/schedule/export
   * 说明：导出全部排期为 xlsx。返回 downloadUrl(签名URL) 或 base64(对象存储降级)
   */
  exportSchedule: () =>
    request<{ downloadUrl: string; fileName: string; base64?: string }>('/api/v1/schedule/export'),

  /**
   * 服务端文件：server/src/routes/schedule.ts
   * 接口：GET /api/v1/schedule/pipeline
   * 说明：统计未来7天内到期的未完成阶段
   */
  schedulePipeline: () =>
    request<{ total: number; stages: { stage: ScheduleStage; count: number }[] }>('/api/v1/schedule/pipeline'),
};

export type ScheduleStage = '大纲' | '粗稿' | '定稿' | '拍摄' | '粗剪' | '送审' | '精剪' | '发布';

export interface ScheduleStageItem {
  date?: string | null;
  done?: boolean;
}

export type ScheduleType = '商单' | '科普选题';

export interface ScheduleItem {
  id: string;
  project_name: string;
  schedule_type: ScheduleType;
  client_name: string;
  pub_date: string | null;
  stages: Partial<Record<ScheduleStage, ScheduleStageItem>>;
  created_at?: string;
  updated_at?: string;
}

export interface SchedulePayload {
  project_name: string;
  schedule_type: ScheduleType;
  client_name?: string;
  pub_date?: string | null;
  stages?: Partial<Record<ScheduleStage, ScheduleStageItem>>;
}

export const SCHEDULE_STAGES: ScheduleStage[] = ['大纲', '粗稿', '定稿', '拍摄', '粗剪', '送审', '精剪', '发布'];