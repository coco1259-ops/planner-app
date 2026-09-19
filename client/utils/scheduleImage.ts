/**
 * 排期图生成器（Web 端）。
 *
 * 运行环境是 Web/PWA（iPhone 主屏幕访问 server/public 静态站点），
 * 因此用 HTML canvas 将排期信息绘制成一张竖版 PNG，供系统分享面板 / 下载 / 保存相册使用。
 *
 * 说明：仅 Web 端调用；canvas 是浏览器 API，在原生端不执行（由调用方用 Platform 判断）。
 */
import { todayG8 } from './gmt8';

/**
 * 将 "YYYY-MM-DD" 转成 "M月D日"，供排期图展示。
 * 无法解析时返回 null（调用方显示"待定"）。
 */
function formatDateCn(date?: string | null): string | null {
  if (!date) return null;
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return `${Number(m[1])}月${Number(m[2])}日`;
}

/** 生成日期文案，如 "生成于 2026年9月20日" */
export const buildGeneratedLabel = (): string => {
  const today = todayG8();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m) return '生成于今日';
  return `生成于 ${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
};

interface ScheduleImageInput {
  projectName: string;
  scheduleType: string;
  clientName?: string;
  pubDate?: string | null;
  stages: { name: string; date?: string | null; done?: boolean }[];
}

/** 绘制并返回 PNG 的 dataURL（canvas 800x1422 约 9:16 竖版） */
export function renderScheduleImageCanvas(input: ScheduleImageInput): string {
  // 竖版 9:16，宽 720 x 高 1280（保持清晰且文件体积适中）
  const W = 720;
  const H = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas ctx');

  // ---- 通用工具 ----
  const font = (weight: number, size: number) => `font-weight:${weight}; font-size:${size}px; font-family:-apple-system,'PingFang SC','Helvetica Neue',sans-serif;`;
  const text = (s: string, x: number, y: number, color: string, size: number, weight = 500, align: CanvasTextAlign = 'left') => {
    ctx.font = font(weight, size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(s, x, y);
  };
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const measureText = (s: string, size: number) => {
    ctx.font = font(500, size);
    return ctx.measureText(s).width;
  };

  // ---- 配色（与 App 风格一致：商单靛蓝 / 科普天蓝）----
  const typeColor = input.scheduleType === '商单' ? '#4F46E5' : '#0EA5E9';
  const bgTop = '#FFFFFF';
  const bgBottom = '#F6F7FB';
  const textMain = '#111827';
  const textSub = '#6B7280';
  const lineGray = '#E5E7EB';
  const doneGreen = '#22C55E';
  const currentColor = '#4F46E5';
  const white = '#FFFFFF';

  // 背景（顶部白 → 底部浅灰 纵向渐变）
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, bgTop);
  grad.addColorStop(1, bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ---- 顶部信息区 ----
  // 类型徽标
  ctx.fillStyle = `${typeColor}1F`;
  roundRect(38, 46, measureText(input.scheduleType, 20) + 36, 40, 20);
  ctx.fill();
  text(input.scheduleType, 56, 56, typeColor, 20, 600);

  // 项目名（大字）
  text(input.projectName, 38, 110, textMain, 34, 800);

  // 客户 + 发布日期
  const clientPart = input.clientName ? `客户：${input.clientName}` : '';
  const pubPart = formatDateCn(input.pubDate) ? `发布日期：${formatDateCn(input.pubDate)}` : '发布日期：待定';
  const metaY = 168;
  if (clientPart) {
    text(clientPart, 38, metaY, textSub, 20, 500);
    text(pubPart, 38 + measureText(clientPart, 20) + 36, metaY, textSub, 20, 500);
  } else {
    text(pubPart, 38, metaY, textSub, 20, 500);
  }

  // 分隔线
  ctx.strokeStyle = lineGray;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(38, 220);
  ctx.lineTo(W - 38, 220);
  ctx.stroke();

  // ---- 中部：8 阶段竖向时间线 ----
  const lineX = 58; // 时间线圆心 x
  const topY = 260;
  const step = 118; // 每个阶段纵向间距（H-上方-底部留白 ≈ (1280-260-150)/4）
  const textColorDone = '#16A34A';
  const textColorCurrent = '#4F46E5';
  const textColorTodo = '#374151';

  input.stages.forEach((st, idx) => {
    const y = topY + idx * step;
    const isDone = !!st.done;
    const isFirstNotDone = !isDone && (idx === 0 || !!input.stages[idx - 1]?.done);
    const dateLabel = formatDateCn(st.date) ?? '待定';

    // 连线（上下）
    if (idx < input.stages.length - 1) {
      ctx.strokeStyle = lineGray;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(lineX, y + 30);
      ctx.lineTo(lineX, y + step);
      ctx.stroke();
    }

    // 节点圆
    ctx.fillStyle = isDone ? doneGreen : isFirstNotDone ? currentColor : '#D1D5DB';
    ctx.beginPath();
    ctx.arc(lineX, y + 18, 15, 0, Math.PI * 2);
    ctx.fill();
    if (isDone) {
      // 绿色勾
      text('✓', lineX, y + 9, white, 18, 800);
    } else if (isFirstNotDone) {
      text(`${idx + 1}`, lineX, y + 10, white, 16, 700);
    }

    // 文本：阶段名（左加粗）+ 状态徽标 + 日期（右侧）
    const nameColor = isDone ? textColorDone : isFirstNotDone ? textColorCurrent : textColorTodo;
    text(st.name, lineX + 32, y + 4, nameColor, 22, 700);

    // 状态徽标
    let statusText: string;
    let statusBg: string;
    let statusColor: string;
    if (isDone) {
      statusText = '已完成';
      statusBg = '#22C55E1F';
      statusColor = '#16A34A';
    } else if (isFirstNotDone) {
      statusText = '进行中';
      statusBg = '#4F46E51F';
      statusColor = '#4F46E5';
    } else {
      statusText = '未开始';
      statusBg = '#E5E7EB';
      statusColor = '#9CA3AF';
    }
    const statusW = measureText(statusText, 16) + 28;
    const statusX = lineX + 32 + measureText(st.name, 22) + 18;
    ctx.fillStyle = statusBg;
    roundRect(statusX, y, statusW, 30, 15);
    ctx.fill();
    text(statusText, statusX + 14, y + 7, statusColor, 16, 600);

    // 日期（右侧，右对齐）
    text(dateLabel, W - 38, y + 4, isFirstNotDone ? currentColor : textSub, 20, 500, 'right');
  });

  // ---- 底部：生成日期（信息新鲜度）----
  ctx.strokeStyle = lineGray;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(38, 1220);
  ctx.lineTo(W - 38, 1220);
  ctx.stroke();
  text(buildGeneratedLabel(), 38, 1240, '#9CA3AF', 18, 500);

  return canvas.toDataURL('image/png');
}