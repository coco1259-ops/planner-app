import { Router } from 'express';
import * as XLSX from 'xlsx';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { SCHEDULE_STAGES } from './schedule';

const router = Router();
const db = getSupabaseClient();

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

/**
 * 服务端文件：server/src/routes/schedule-export.ts
 * 接口：GET /api/v1/schedule/export
 * 说明：导出全部排期项目为 xlsx，上传对象存储并返回签名下载 URL（只读）
 */
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await db
      .from('schedule')
      .select('*')
      .order('pub_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const rows = data ?? [];

    // 表头：项目名/类型/客户名/各阶段日期/各阶段状态（已完成显示✓）
    const header = [
      '项目名称',
      '类型',
      '客户名',
      ...SCHEDULE_STAGES.flatMap((s) => [`${s}日期`, `${s}状态`]),
    ];

    const body = rows.map((r: { project_name: string; schedule_type: string; client_name: string; stages?: Record<string, { date?: string | null; done?: boolean }> }) => {
      const stages = r.stages ?? {};
      const row: (string)[] = [r.project_name, r.schedule_type, r.client_name || ''];
      for (const st of SCHEDULE_STAGES) {
        const s = stages[st] ?? {};
        row.push(s.date || '');
        row.push(s.done ? '✓' : '');
      }
      return row;
    });

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
    worksheet['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 16 }, ...SCHEDULE_STAGES.flatMap(() => [{ wch: 12 }, { wch: 8 }])];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '内容排期');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const base64 = buffer.toString('base64');
    const fileName = `schedule_export_${Date.now()}.xlsx`;

    // 优先上传对象存储返回签名 URL；失败则降级返回 base64，由前端生成可下载文件
    try {
      const key = await storage.uploadFile({
        fileContent: buffer,
        fileName,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const downloadUrl = await storage.generatePresignedUrl({ key, expireTime: 86400 });
      return res.json({ downloadUrl, fileName });
    } catch (storageErr) {
      console.error('对象存储上传失败，降级返回 base64', storageErr);
      return res.json({ downloadUrl: '', fileName, base64 });
    }
  } catch (e) {
    console.error('导出排期失败', e);
    res.status(500).json({ error: '导出排期失败' });
  }
});

export default router;