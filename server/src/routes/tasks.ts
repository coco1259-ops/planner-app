import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = Router();
const db = getSupabaseClient();

export const TASK_TYPES = ['deep', 'light', 'family', 'study'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_STATUSES = ['todo', 'done', 'abandoned'] as const;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timeSlotPattern = /^\d{2}:\d{2}$/;

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  remark: z.string().trim().max(500).optional().nullable(),
  task_type: z.enum(TASK_TYPES).default('light'),
  plan_date: z.string().regex(datePattern, 'plan_date must be YYYY-MM-DD'),
  time_slot: z.string().regex(timeSlotPattern, 'time_slot must be HH:MM').default('09:00'),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  remark: z.string().trim().max(500).nullable().optional(),
  task_type: z.enum(TASK_TYPES).optional(),
  plan_date: z.string().regex(datePattern, 'plan_date must be YYYY-MM-DD').optional(),
  time_slot: z.string().regex(timeSlotPattern, 'time_slot must be HH:MM').optional(),
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
      .insert({ ...parsed.data, status: 'todo' })
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