import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { weekMondayG8 } from '../utils/gmt8';

const router = Router();
const db = getSupabaseClient();

// 返回当前周的周一日期（YYYY-MM-DD，GMT+8），作为"归属周"标识
function getMondayOfWeek(): string {
  return weekMondayG8();
}

export const TASK_TYPES = [
  'deep',
  'light',
  'family',
  'study',
  'work',
  'childcare',
  'chores',
  'personal',
  'goal',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_STATUSES = ['todo', 'done', 'abandoned'] as const;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
// 兼容单个时间（09:00）与时间段范围（4:00-7:00）
const timeSlotPattern = /^\d{1,2}:\d{2}(-\d{1,2}:\d{2})?$/;

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  remark: z.string().trim().max(500).optional().nullable(),
  task_type: z.enum(TASK_TYPES).default('light'),
  plan_date: z.string().regex(datePattern, 'plan_date must be YYYY-MM-DD'),
  week_key: z.string().regex(datePattern, 'week_key must be YYYY-MM-DD').optional().nullable(),
  time_slot: z.string().regex(timeSlotPattern, 'time_slot must be HH:MM or HH:MM-HH:MM').default('09:00'),
  estimated_duration: z.string().trim().max(40).nullish(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  remark: z.string().trim().max(500).nullable().optional(),
  task_type: z.enum(TASK_TYPES).optional(),
  plan_date: z.string().regex(datePattern, 'plan_date must be YYYY-MM-DD').optional(),
  week_key: z.string().regex(datePattern, 'week_key must be YYYY-MM-DD').nullable().optional(),
  time_slot: z.string().regex(timeSlotPattern, 'time_slot must be HH:MM or HH:MM-HH:MM').optional(),
  estimated_duration: z.string().trim().max(40).nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

const batchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  action: z.enum(['reschedule', 'abandon', 'done', 'todo']),
  plan_date: z.string().regex(datePattern, 'plan_date must be YYYY-MM-DD').optional(),
});

/**
 * 服务端文件：server/src/routes/tasks.ts
 * 接口：GET /api/v1/tasks?date=YYYY-MM-DD
 * Query 参数：date?: string (YYYY-MM-DD)
 */
router.get('/', async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    let query = db.from('tasks').select('*');
    if (date) query = query.eq('plan_date', date);
    const { data, error } = await query.order('time_slot', { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: '获取任务失败' });
  }
});

/**
 * 服务端文件：server/src/routes/tasks.ts
 * 接口：GET /api/v1/tasks/incomplete
 */
router.get('/incomplete', async (_req, res) => {
  try {
    const { data, error } = await db
      .from('tasks')
      .select('*')
      .eq('status', 'todo')
      .order('plan_date', { ascending: true })
      .order('time_slot', { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: '获取未完成任务失败' });
  }
});

/**
 * 服务端文件：server/src/routes/tasks.ts
 * 接口：GET /api/v1/tasks/range?start=YYYY-MM-DD&end=YYYY-MM-DD[&status=todo][&weekKey=YYYY-MM-DD]
 * Query 参数：start: string (YYYY-MM-DD), end: string (YYYY-MM-DD), status?: 'todo', weekKey?: string (该周周一)
 * 说明：返回 [start, end] 日期区间内的任务。若传 weekKey，则额外用 task_type='goal' &
 *       week_key=weekKey 匹配的"目标"任务归并进来（目标按归属周过滤，不看 plan_date）。
 *       若 status 传 todo，则仅返回未完成的任务。
 */
router.get('/range', async (req, res) => {
  try {
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const status = req.query.status as string | undefined;
    const weekKey = req.query.weekKey as string | undefined;
    if (!start || !end) {
      return res.status(400).json({ error: '缺少 start/end 参数' });
    }
    let query = db
      .from('tasks')
      .select('*')
      .gte('plan_date', start)
      .lte('plan_date', end);
    if (status) query = query.eq('status', status);
    const { data: rangeTasks, error: err1 } = await query
      .order('plan_date', { ascending: true })
      .order('time_slot', { ascending: true });
    if (err1) throw err1;

    // 若指定 weekKey：将目标（归属周=weekKey）归并，保证目标区完整展示
    let tasks = rangeTasks ?? [];
    if (weekKey) {
      const { data: goalTasks, error: err2 } = await db
        .from('tasks')
        .select('*')
        .eq('task_type', 'goal')
        .eq('week_key', weekKey)
        .eq('plan_date', start); // 目标 plan_date = 该周周一
      if (err2) throw err2;
      const existing = new Set(tasks.map((t) => t.id));
      tasks = [...tasks, ...(goalTasks ?? []).filter((g) => !existing.has(g.id))];
      tasks.sort((a, b) =>
        a.plan_date === b.plan_date ? (a.time_slot < b.time_slot ? -1 : 1) : a.plan_date < b.plan_date ? -1 : 1,
      );
    }

    res.json({ data: tasks });
  } catch (e) {
    res.status(500).json({ error: '获取周任务失败' });
  }
});

/**
 * 服务端文件：server/src/routes/tasks.ts
 * 接口：GET /api/v1/tasks/:id
 * Path 参数：id: string
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await db.from('tasks').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: '任务不存在' });
      throw error;
    }
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: '获取任务失败' });
  }
});

/**
 * 服务端文件：server/src/routes/tasks.ts
 * 接口：POST /api/v1/tasks
 * Body 参数：title: string, remark?: string|null, task_type?: 'deep'|'light'|'family'|'study', plan_date: string, time_slot?: string
 */
router.post('/', async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
    }
    const { data, error } = await db
      .from('tasks')
      .insert({
        ...parsed.data,
        // goal(目标) 类型若未显式传 week_key，则默认归属当前周的周一
        week_key: parsed.data.week_key ?? (parsed.data.task_type === 'goal' ? getMondayOfWeek() : null),
        status: 'todo',
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: '创建任务失败' });
  }
});

/**
 * 服务端文件：server/src/routes/tasks.ts
 * 接口：PATCH /api/v1/tasks/:id
 * Path：id: string; Body：title?, remark?, task_type?, plan_date?, time_slot?, status?
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
    }
    const { data, error } = await db
      .from('tasks')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: '更新任务失败' });
  }
});

/**
 * 服务端文件：server/src/routes/tasks.ts
 * 接口：POST /api/v1/tasks/batch
 * Body：ids: string[], action: 'reschedule'|'abandon'|'done'|'todo', plan_date?: string
 */
router.post('/batch', async (req, res) => {
  try {
    const parsed = batchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
    }
    const { ids, action, plan_date } = parsed.data;
    if (action === 'reschedule' && !plan_date) {
      return res.status(400).json({ error: '改期需要提供 plan_date' });
    }
    const patch: Record<string, unknown> =
      action === 'reschedule' ? { plan_date } : { status: action };
    const { error } = await db.from('tasks').update(patch).in('id', ids);
    if (error) throw error;
    res.json({ ok: true, updated: ids.length });
  } catch (e) {
    res.status(500).json({ error: '批量操作失败' });
  }
});

/**
 * 服务端文件：server/src/routes/tasks.ts
 * 接口：DELETE /api/v1/tasks/:id
 * Path：id: string
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await db.from('tasks').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除任务失败' });
  }
});

export default router;