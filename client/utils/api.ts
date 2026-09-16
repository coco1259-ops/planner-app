/**
 * 全局 API 工具与共享类型
 * 后端 Base URL 统一使用 EXPO_PUBLIC_BACKEND_BASE_URL（系统注入）
 */
const API_BASE = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? '').replace(/\/$/, '');

export type TaskType = 'deep' | 'light' | 'family' | 'study';
export type TaskStatus = 'todo' | 'done' | 'abandoned';

export interface Task {
  id: string;
  title: string;
  remark: string | null;
  task_type: TaskType;
  plan_date: string; // YYYY-MM-DD
  time_slot: string; // HH:MM
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export const TYPE_META: Record<TaskType, { name: string; color: string }> = {
  deep: { name: '深度', color: '#3B82F6' },
  light: { name: '轻任务', color: '#22C55E' },
  family: { name: '家庭', color: '#F97316' },
  study: { name: '学习', color: '#A855F7' },
};

export const TYPE_ORDER: TaskType[] = ['deep', 'light', 'family', 'study'];

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
};