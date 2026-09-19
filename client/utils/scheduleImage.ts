/**
 * 排期图生成器（Web 端）。
 *
 * 运行环境是 Web/PWA（iPhone 主屏幕访问 server/public 静态站点），
 * 因此用 HTML canvas 将排期信息绘制成一张竖版 PNG，供系统分享面板 / 下载使用。
 *
 * 设计定位：独立渲染的客户交付图（非页面截图），风格专业、信息密度高、竖版 4:5。
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

/** 返回两个 GMT+8 日期相差的天数（date - today，可负）。today 为今天（GMT+8）。 */
function diffDaysFromToday(date: string): number {
  const today = todayG8() || '';
  if (!date || !today) return 0;
  const d1 = new Date(`${date}T00:00:00`);
  const d2 = new Date(`${today}T00:00:00`);
  return Math.round((d1.getTime() - d2.getTime()) / 86400000);
}

interface ScheduleImageInput {
  projectName: string;
  scheduleType: string;
  clientName?: string;
  pubDate?: string | null;
  stages: { name: string; date?: string | null; done?: boolean }[];
}

/**
 * 绘制并返回 PNG 的 dataURL。
 * 画布 1080 x 1350（4:5 竖版），适合微信点开一屏看完。
 */
export function renderScheduleImageCanvas(input: ScheduleImageInput): string {
  const W = 1080;
  const H = 1350;
  const dpr = 2; // 2x 像素保证清晰
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas ctx');
  ctx.scale(dpr, dpr);

  // ---- 通用工具 ----
  const font = (weight: number, size: number) =>
    `font-weight:${weight}; font-size:${size}px; font-family:-apple-system,'PingFang SC','Helvetica Neue',sans-serif;`;
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

  // ---- 配色（紫色系主色，纯白底，圆角卡片浅灰描边）----
  const purple = '#7C3AED'; // 主紫
  const purpleBorder = '#C4B5FD';
  const purpleSoft = '#F5F3FF'; // 浅紫底（当前阶段高亮）
  const textMain = '#111827';
  const textSub = '#6B7280';
  const textLight = '#9CA3AF';
  const lineGray = '#E5E7EB';
  const cardBorder = '#E8E8EE';
  const white = '#FFFFFF';
  const doneGreen = '#22C55E';
  const doneGreenText = '#16A34A';

  const PX = 44; // 页边距
  const W_INNER = W - PX * 2; // 内容宽

  // ---- 底色：纯白 ----
  ctx.fillStyle = white;
  ctx.fillRect(0, 0, W, H);

  // ============= 区块1：头部品牌条 =============
  let y = 40;
  // 左侧署名
  text('起舞龙清影', PX, y, textMain, 26, 700);
  // 右侧小字
  text('项目排期表 PROJECT SCHEDULE', W - PX, y + 6, textLight, 18, 500, 'right');
  y += 54;

  // ============= 区块2：项目信息卡 =============
  const cardY = y;
  const cardH = 158;
  ctx.fillStyle = white;
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1.5;
  roundRect(PX, cardY, W_INNER, cardH, 18);
  ctx.fill();
  ctx.stroke();

  // 项目名（大字）
  const projectName = input.projectName || '未命名项目';
  text(projectName, PX + 28, cardY + 24, textMain, 34, 800);
  // 类型小徽标（右上）
  const typeText = input.scheduleType;
  const typeW = measureText(typeText, 18) + 28;
  ctx.fillStyle = purpleSoft;
  roundRect(W - PX - typeW - 28, cardY + 26, typeW, 32, 16);
  ctx.fill();
  text(typeText, W - PX - 28 - typeW / 2, cardY + 33, purple, 18, 600, 'center');

  // 一行三列：品牌方 | 发布日期 | 当前进度
  const colW = W_INNER / 3;
  const metaTop = cardY + 88;
  const labelColor = textLight;
  const rowLabel = (label: string, x: number) => text(label, x, metaTop - 2, labelColor, 16, 500);
  const rowValue = (value: string, x: number, color = textMain) => text(value, x, metaTop + 26, color, 20, 600);

  // 品牌方
  rowLabel('品牌方', PX + 28);
  rowValue(input.clientName || '—', PX + 28);

  // 发布日期
  const pubX = PX + 28 + colW;
  rowLabel('发布日期', pubX);
  rowValue(formatDateCn(input.pubDate) ? `${formatDateCn(input.pubDate)}` : '待定', pubX);

  // 当前进度（如 "大纲 · 第1/8阶段"）
  const progX = PX + 28 + colW * 2;
  rowLabel('当前进度', progX);
  const firstNotDone = input.stages.findIndex((s) => !s.done);
  const curIdx = firstNotDone === -1 ? input.stages.length : firstNotDone;
  const curStageName = curIdx > 0 && curIdx <= input.stages.length ? input.stages[curIdx - 1].name : '';
  rowValue(`${curStageName} · 第${curIdx}/${input.stages.length}阶段`, progX);

  y = cardY + cardH + 26;

  // ============= 区块3：8阶段紧凑时间线（核心，行高约90px） =============
  const ROW_H = 92;
  const topY = y;
  const stages = input.stages;
  const lineX = 62; // 时间线竖轴 x（节点圆心）
  const N = stages.length;

  stages.forEach((st, idx) => {
    const rowY = topY + idx * ROW_H;
    const isDone = !!st.done;
    const isCurrent = !isDone && (idx === 0 || !!stages[idx - 1]?.done);

    // 当前阶段整行浅紫底高亮
    if (isCurrent) {
      ctx.fillStyle = purpleSoft;
      roundRect(PX, rowY - 4, W_INNER, ROW_H - 6, 16);
      ctx.fill();
    }

    // 连轴（竖直线）：从上一行节点底到本行节点中心
    ctx.strokeStyle = isDone || isCurrent ? '#C4B5FD' : lineGray;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lineX, rowY - 4);
    ctx.lineTo(lineX, rowY + 36);
    ctx.stroke();
    if (idx === 0) {
      // 顶段短竖线
      ctx.strokeStyle = lineGray;
      ctx.beginPath();
      ctx.moveTo(lineX, topY - 12);
      ctx.lineTo(lineX, topY + 34);
      ctx.stroke();
    }

    // 节点圆
    const cy = rowY + 36;
    if (isDone) {
      // 实心绿圆 + 白勾
      ctx.fillStyle = doneGreen;
      ctx.beginPath();
      ctx.arc(lineX, cy, 16, 0, Math.PI * 2);
      ctx.fill();
      text('✓', lineX, cy - 11, white, 20, 800, 'center');
    } else if (isCurrent) {
      // 放大紫圆 + 白字序号
      ctx.fillStyle = purple;
      ctx.beginPath();
      ctx.arc(lineX, cy, 19, 0, Math.PI * 2);
      ctx.fill();
      text(`${idx + 1}`, lineX, cy - 11, white, 20, 800, 'center');
    } else {
      // 浅灰空心圆
      ctx.strokeStyle = '#C4CBD2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lineX, cy, 15, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 阶段名（加粗，左）
    const nameX = lineX + 34;
    const nameColor = isDone ? doneGreenText : isCurrent ? purple : textMain;
    text(st.name, nameX, rowY + 22, nameColor, 22, 700);

    // 状态徽章
    let statusText: string;
    let statusBg: string;
    let statusColor: string;
    let statusBorder = 'transparent';
    if (isDone) {
      statusText = '已完成';
      statusBg = '#22C55E1A';
      statusColor = doneGreenText;
    } else if (isCurrent) {
      statusText = '进行中';
      statusBg = '#7C3AED22';
      statusColor = purple;
      statusBorder = purpleBorder;
    } else {
      statusText = '未开始';
      statusBg = '#F1F2F4';
      statusColor = textLight;
    }
    const statusW = measureText(statusText, 16) + 26;
    const statusX = nameX + measureText(st.name, 22) + 16;
    ctx.fillStyle = statusBg;
    roundRect(statusX, rowY + 22, statusW, 30, 15);
    ctx.fill();
    if (statusBorder !== 'transparent') {
      ctx.strokeStyle = statusBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    text(statusText, statusX + 13, rowY + 29, statusColor, 16, 600);

    // 日期（右对齐）
    const dateLabel = formatDateCn(st.date) ?? '待定';
    text(dateLabel, W - PX - 28, rowY + 24, isCurrent ? purple : textSub, 20, 500, 'right');
  });

  const timelineBottom = topY + N * ROW_H;

  // ---- 日期相同的相邻阶段行：紧凑排列（通过更小行高已在上方体现；此处省略额外合并） ----

  // ============= 区块4：进度摘要条 =============
  const doneCount = stages.filter((s) => s.done).length;
  const firstTodoIdx = stages.findIndex((s) => !s.done);
  const doingCount = firstTodoIdx === -1 ? 0 : 1; // 第一个未完成阶段 = 进行中
  const todoCount = stages.length - doneCount - doingCount;
  // 距发布天数：发布日期 - 今天
  let daysToPub = '';
  if (input.pubDate && formatDateCn(input.pubDate)) {
    const d = diffDaysFromToday(input.pubDate);
    if (d >= 0) daysToPub = `${d} 天`;
    else daysToPub = '已发布';
  } else {
    daysToPub = '待定';
  }

  const sumY = timelineBottom + 28;
  ctx.fillStyle = '#FAFAFC';
  roundRect(PX, sumY, W_INNER, 66, 16);
  ctx.fill();
  const sumText = `已完成 ${doneCount} · 进行中 ${doingCount} · 未开始 ${todoCount} · 距发布 ${daysToPub}`;
  text(sumText, PX + 28, sumY + 23, textSub, 20, 600);

  // ============= 区块5：底部 =============
  const footY = H - 56;
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PX, footY - 18);
  ctx.lineTo(W - PX, footY - 18);
  ctx.stroke();
  text(buildGeneratedLabel(), PX, footY, '#111827', 18, 600);
  text('项目进度如有调整，将同步更新', W - PX, footY, textLight, 18, 400, 'right');

  return canvas.toDataURL('image/png');
}