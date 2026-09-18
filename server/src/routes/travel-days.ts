import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = Router();
const db = getSupabaseClient();

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const weekKeyPattern = /^\d{4}-\d{2}-\d{2}$/; // 周标识用该周周一日期

const saveSchema = z.object({
  weekKey: z.string().regex(weekKeyPattern, 'weekKey must be YYYY-MM-DD'),
  dates: z.array(z.string().regex(datePattern, 'date must be YYYY-MM-DD')).max(7),
});

/**
 * 服务端文件：server/src/routes/travel-days.ts
 * 接口：GET /api/v1/travel-days?weekKey=YYYY-MM-DD
 * Query 参数：weekKey: string (该周周一日期)
 */
router.get('/', async (req, res) => {
  try {
    const weekKey = req.query.weekKey as string | undefined;
    if (!weekKey) return res.status(400).json({ error: '缺少 weekKey 参数' });
    const { data, error } = await db
      .from('travel_days')
      .select('day_date')
      .eq('week_key', weekKey)
      .order('day_date', { ascending: true });
    if (error) throw error;
    const dates = (data ?? []).map((r: { day_date: string }) => r.day_date);
    res.json({ data: dates });
  } catch (e) {
    res.status(500).json({ error: '获取出行日失败' });
  }
});

/**
 * 服务端文件：server/src/routes/travel-days.ts
 * 接口：POST /api/v1/travel-days
 * Body 参数：weekKey: string (该周周一日期), dates: string[] (出行日期数组)
 * 说明：保存该周出行日（先清空该周旧数据再整周覆盖写入）
 */
router.post('/', async (req, res) => {
  try {
    const parsed = saveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
    }
    const { weekKey, dates } = parsed.data;

    // 事务式：先删该周旧出行日，再整周覆盖
    const { error: delError } = await db.from('travel_days').delete().eq('week_key', weekKey);
    if (delError) throw delError;

    if (dates.length > 0) {
      const { error: insError } = await db.from('travel_days').insert(
        dates.map((d) => ({ week_key: weekKey, day_date: d })),
      );
      if (insError) throw insError;
    }

    // 返回保存后的出行日
    const { data, error } = await db
      .from('travel_days')
      .select('day_date')
      .eq('week_key', weekKey)
      .order('day_date', { ascending: true });
    if (error) throw error;
    res.json({ data: (data ?? []).map((r: { day_date: string }) => r.day_date) });
  } catch (e) {
    res.status(500).json({ error: '保存出行日失败' });
  }
});

export default router;