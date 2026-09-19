/**
 * 排期 Excel 导出辅助（Web 端 PWA 为主）。
 *
 * 后端返回签名 URL / base64，Web 端用 <a download> 触发下载。原逻辑从详情页抽取，
 * 现由排期 Tab 列表页顶部的"导出Excel并发送"复用。
 */
import { Platform } from 'react-native';
import { api } from './api';

function base64ToBlob(b64: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function triggerDownload(url: string, fileName: string) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  fetch(url)
    .then((r) => r.blob())
    .then((blob) => {
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    })
    .catch(() => {
      window.open(url, '_blank');
    });
}

export interface ExportResult {
  ok: boolean;
  fileName: string;
}

/** 导出全量排期项目 Excel（内部后台数据） */
export async function exportScheduleExcel(): Promise<ExportResult> {
  const { downloadUrl, fileName, base64 } = await api.exportSchedule();
  const finalUrl =
    downloadUrl ||
    (base64 && Platform.OS === 'web' ? URL.createObjectURL(base64ToBlob(base64)) : '');

  if (!finalUrl) {
    if (Platform.OS !== 'web') {
      // 原生端无 URL 提示在网页端使用
      return { ok: true, fileName };
    }
    return { ok: false, fileName };
  }

  const nav: any = (globalThis as any).navigator;
  if (Platform.OS === 'web' && typeof nav?.share === 'function') {
    try {
      await nav.share({ title: '内容排期表', text: '内容排期表已导出', url: finalUrl });
      return { ok: true, fileName };
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') return { ok: true, fileName };
      triggerDownload(finalUrl, fileName);
      return { ok: true, fileName };
    }
  }
  if (Platform.OS === 'web') {
    triggerDownload(finalUrl, fileName);
    return { ok: true, fileName };
  }
  return { ok: true, fileName };
}