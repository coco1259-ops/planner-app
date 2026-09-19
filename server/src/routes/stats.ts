import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { todayG8, lastWeekDaysG8 } from '../utils/gmt8';

const router = Router();
const db = getSupabaseClient();

const TYPE_META: Record<string, { name: string; color: string }> = {
  deep: { name: '深度', color: '#3B82F6' },
  light: { name: '轻任务', color: '#22C55E' },
  family: { name: '家庭', color: '#F97316' },
  study: { name: '学习', color: '#A855F7' },
};

const STATUS_META: Record<string, { name: string; color: string }> = {
  todo: { name: '未做', color: '#F97316' },
  done: { name: '已完成', color: '#22C55E' },
  abandoned: { name: '已放弃', color: '#9CA3AF' },
};

/**
 * 服务端文件：server/src/routes/stats.ts
 * 接口：GET /api/v1/stats/overview
 */
router.get('/overview', async (_req, res) => {
  try {
    const { data, error } = await db.from('tasks').select('plan_date, task_type, status');
    if (error) throw error;

    const today = todayG8();
    let total = 0;
    let todayCount = 0;
    const byType: Record<string, number> = { deep: 0, light: 0, family: 0, study: 0 };
    const byStatus: Record<string, number> = { todo: 0, done: 0, abandoned: 0 };
    const perDay: Record<string, number> = {};

    for (const row of data ?? []) {
      total += 1;
      if (byType[row.task_type] !== undefined) byType[row.task_type] += 1;
      if (byStatus[row.status] !== undefined) byStatus[row.status] += 1;
      perDay[row.plan_date] = (perDay[row.plan_date] ?? 0) + 1;
      if (row.plan_date === today && row.status !== 'abandoned') todayCount += 1;
    }

    const trend = lastWeekDaysG8().map((date) => ({
      date,
      label: date.slice(5).replace('-', '/'),
      count: perDay[date] ?? 0,
    }));

    res.json({
      total,
      done: byStatus.done,
      todo: byStatus.todo,
      abandoned: byStatus.abandoned,
      today: todayCount,
      byType: Object.keys(TYPE_META).map((k) => ({
        name: TYPE_META[k].name,
        key: k,
        color: TYPE_META[k].color,
        value: byType[k],
      })),
      byStatus: Object.keys(STATUS_META).map((k) => ({
        name: STATUS_META[k].name,
        key: k,
        color: STATUS_META[k].color,
        value: byStatus[k],
      })),
      trend,
    });
  } catch (e) {
    res.status(500).json({ error: '获取统计失败' });
  }
});

export default router;