/**
 * 内容分享辅助（Web 端 PWA 为主，兼容原生端降级）。
 *
 * 运行环境为 iPhone 主屏幕访问的 PWA（server/public 静态站点），故以 Web API 为主：
 * - 系统分享面板：navigator.share({ files })（iOS Safari/PWA 支持，可发微信、保存图像等）
 * - 分享失败降级为 <a download> 下载
 */
import { Platform } from 'react-native';

/** 将 dataURL(base64 PNG) 转为 blob，用于 navigator.share 或下载 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);/)?.[1] || 'image/png';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function triggerDownload(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * 分享一张 PNG 图片：优先系统分享面板（可发微信/存相册），失败降级为下载。
 * @param dataUrl PNG 的 dataURL
 * @param fileName 分享/下载文件名
 */
export async function shareImageFromDataUrl(dataUrl: string, fileName = `排期图_${Date.now()}.png`): Promise<void> {
  if (Platform.OS !== 'web') {
    // 原生端：这里做降级（expo-media-library 由调用方扩展）
    triggerDownloadSafely(dataUrl, fileName);
    return;
  }
  const nav: any = (globalThis as any).navigator;
  try {
    const blob = dataUrlToBlob(dataUrl);
    const file = new File([blob], fileName, { type: 'image/png' });
    if (typeof nav?.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: fileName, text: fileName });
        return;
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') return; // 用户取消分享
        // 分享失败 → 降级下载
      }
    }
    if (typeof nav?.share === 'function') {
      // 不支持文件分享时，尝试分享 URL（dataURL 过长可能失败，用 find替代）
      await nav.share({ title: fileName, text: fileName, url: dataUrl }).catch(() => triggerDownloadSafely(dataUrl, fileName));
      return;
    }
    triggerDownloadSafely(dataUrl, fileName);
  } catch {
    triggerDownloadSafely(dataUrl, fileName);
  }
}

// 非 Web 下无法用 DOM，直接忽略（真实流程只走 Web）
function triggerDownloadSafely(dataUrl: string, fileName: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  triggerDownload(dataUrl, fileName);
}