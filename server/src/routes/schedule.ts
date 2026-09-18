import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = Router();
const db = getSupabaseClient();

export const SCHEDULE_STAGES = ['大纲', '粗稿', '定稿', '拍摄', '粗剪', '送审', '精剪', '发布'] as const;
export type ScheduleStage = (typeof SCHEDULE_STAGES)[number];

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// 单个阶段：date(计划日期,可空) + done(布尔,默认false)
const stageSchema = z.object({
  date: z.string().regex(datePattern).nullable().optional().default(null),
  done: z.boolean().optional().default(false),
});

const createSchema = z.object({
  project_name: z.string().min(1, '项目名称不能为空'),
  schedule_type: z.enum(['商单', '科普选题']).default('商单'),
  client_name: z.string().optional().default(''),
  pub_date: z.string().regex(datePattern).nullable().optional().default(null),
  stages: z.record(z.string(), stageSchema).optional().default({}),
});

const updateSchema = createSchema.partial();

/**
 * 服务端文件：server/src/routes/schedule.ts
 * 接口：GET /api/v1/schedule
 * 说明：按发布日期升序返回所有排期项目
 */
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await db
      .from('schedule')
      .select('*')
      .order('pub_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    res.json({ data: data ?? [] });
  } catch {
    res.status(500).json({ error: '获取排期列表失败' });
  }
});

/**
 * 服务端文件：server/src/routes/schedule.ts
 * 接口：GET /api/v1/schedule/pipeline
 * 说明：统计未来7天内到期的未完成阶段，格式 { total, stages: [{stage,count}] }
 * 注意：此静态路由必须定义在 /:id 之前
 */
router.get('/pipeline', async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 7);

    const { data, error } = await db.from('schedule').select('stages, pub_date');
    if (error) throw error;

    const counter: Record<string, number> = {};
    const rows = data ?? [];
    for (const r of rows) {
      const stages = (r as { stages?: Record<string, { date?: string | null; done?: boolean }> }).stages ?? {};
      for (const [stage, item] of Object.entries(stages)) {
        if (!item?.date || item.done) continue;
        const d = new Date(item.date + 'T00:00:00');
        if (isNaN(d.getTime())) continue;
        if (d >= today && d <= end) {
          counter[stage] = (counter[stage] ?? 0) + 1;
        }
      }
    }
    const stages = Object.entries(counter)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => (SCHEDULE_STAGES.indexOf(a.stage as ScheduleStage) - SCHEDULE_STAGES.indexOf(b.stage as ScheduleStage)));
    res.json({ total: stages.reduce((s, x) => s + x.count, 0), stages });
  } catch {
    res.status(500).json({ error: '获取内容管线统计失败' });
  }
});

/**
 * 服务端文件：server/src/routes/schedule.ts
 * 接口：GET /api/v1/schedule/:id
 * Query/Path 参数：id: string (项目ID)
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { data, error } = await db.from('schedule').select('*').eq('id', id).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: '未找到该项目' });
    res.json({ data });
  } catch {
    res.status(500).json({ error: '获取项目详情失败' });
  }
});

/**
 * 服务端文件：server/src/routes/schedule.ts
 * 接口：POST /api/v1/schedule
 * Body 参数：project_name: string, schedule_type: '商单'|'科普选题', client_name?: string,
 *           pub_date?: string|null, stages?: Record<stage, {date?, done?}>
 */
router.post('/', async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
    }
    const body = parsed.data;
    const { data, error } = await db
      .from('schedule')
      .insert({
        project_name: body.project_name,
        schedule_type: body.schedule_type,
        client_name: body.client_name ?? '',
        pub_date: body.pub_date ?? null,
        stages: body.stages ?? {},
      })
      .select('*')
      .single();
    if (error) throw error;
    res.json({ data });
  } catch {
    res.status(500).json({ error: '创建排期失败' });
  }
});

/**
 * 服务端文件：server/src/routes/schedule.ts
 * 接口：PUT /api/v1/schedule/:id
 * Path 参数：id: string, Body 见 createSchema 的 partial
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
    }
    const body = parsed.data;
    const patch: Record<string, unknown> = {};
    if (body.project_name !== undefined) patch.project_name = body.project_name;
    if (body.schedule_type !== undefined) patch.schedule_type = body.schedule_type;
    if (body.client_name !== undefined) patch.client_name = body.client_name;
    if (body.pub_date !== undefined) patch.pub_date = body.pub_date ?? null;
    if (body.stages !== undefined) patch.stages = body.stages;
    patch.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('schedule')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ data });
  } catch {
    res.status(500).json({ error: '更新排期失败' });
  }
});

/**
 * 服务端文件：server/src/routes/schedule.ts
 * 接口：DELETE /api/v1/schedule/:id
 * Path 参数：id: string
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { error } = await db.from('schedule').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: '删除排期失败' });
  }
});

export default router;