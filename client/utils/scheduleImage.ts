/**
 * 排期图生成器（Web 端）。
 *
 * 运行环境是 Web/PWA（iPhone 主屏幕访问 server/public 静态站点），
 * 因此用 HTML canvas 将排期信息绘制成一张竖版 PNG，供系统分享面板 / 下载使用。
 *
 * 设计定位：独立渲染的客户交付图（非页面截图），奶油米白底、紫色系主色、
 * 竖版 960x1600（更窄更长），信息密度高、层级清晰、手机上一眼可读。
 * 说明：仅 Web 端调用；canvas 是浏览器 API，在原生端不执行（由调用方用 Platform 判断）。
 */
import { todayG8 } from './gmt8';

/** 将 "YYYY-MM-DD" 转成 "M月D日"，供排期图展示。无法解析返回 null（调用方显示"待定"）。 */
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
 * 画布 960 x 1600（竖版，更窄更长），参考设计稿比例，微信点开一目了然。
 */
export function renderScheduleImageCanvas(input: ScheduleImageInput): string {
  const W = 960;
  const H = 1600;
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
  const text = (
    s: string, x: number, y: number, color: string, size: number,
    weight = 500, align: CanvasTextAlign = 'left',
  ) => {
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

  // ---- 配色（奶油米白底 + 紫色系主色，柔和质感）----
  const cream = '#FAF7F2'; // 奶油米白底
  const purple = '#7C3AED'; // 主紫
  const purpleDeep = '#6D28D9';
  const purpleBorder = '#C4B5FD';
  const purpleSoft = '#F3EEFD'; // 浅紫底（当前阶段高亮）
  const textMain = '#1F2430';
  const textSub = '#6B7280';
  const textLight = '#9AA0AB';
  const lineGray = '#ECE7DF';
  const cardBorder = '#E6DFD5';
  const white = '#FFFFFF';
  const doneGreen = '#22C55E';
  const doneGreenText = '#16A34A';
  const grayChip = '#EFEEEB';

  const PX = 52; // 页边距
  const W_INNER = W - PX * 2; // 内容宽

  // ---- 底色：奶油米白 ----
  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, W, H);

  // ============= 区块1：头部品牌条 =============
  // 左侧署名：字号约画布宽度 4.5%（960*4.5%≈43px），加粗显眼
  const signSize = Math.round(W * 0.045);
  text('起舞龙清影', PX, 44, textMain, signSize, 800);
  // 右侧两行小字：项目排期表 / PROJECT SCHEDULE
  text('项目排期表', W - PX, 40, textSub, 20, 700, 'right');
  text('PROJECT SCHEDULE', W - PX, 68, textLight, 13, 500, 'right');
  const headerBottom = 40 + 88;

  // ============= 区块2：项目信息卡（白色大圆角、细边框、大内边距） =============
  const cardY = headerBottom + 6;
  const cardH = 218;
  const cardRadius = 24;
  ctx.fillStyle = white;
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1.5;
  roundRect(PX, cardY, W_INNER, cardH, cardRadius);
  ctx.fill();
  ctx.stroke();

  const cardX = PX + 36; // 卡片内左边距（大内边距）
  const cardRight = W - PX - 36;

  // 项目名（大字加粗，左上）
  const projectName = input.projectName || '未命名项目';
  const projSize = 40;
  text(projectName, cardX, cardY + 30, textMain, projSize, 800);
  const projNameW = measureText(projectName, projSize);

  // 类型胶囊（右上，浅紫底紫字）
  const typeText = input.scheduleType;
  const typeW = measureText(typeText, 19) + 34;
  const typeH = 38;
  ctx.fillStyle = purpleSoft;
  roundRect(cardRight - typeW, cardY + 34, typeW, typeH, 19);
  ctx.fill();
  text(typeText, cardRight - typeW / 2, cardY + 41, purple, 19, 700, 'center');

  // 三列等宽对称：品牌方 / 发布日期 / 当前进度（左中右对齐）
  const colGap = 20;
  const threeCols = (cardRight - cardX - colGap * 2) / 3;
  const colX = [cardX, cardX + threeCols + colGap, cardX + (threeCols + colGap) * 2];
  const labelY = cardY + 120;
  const valueY = cardY + 154;
  const colLabel = (label: string, x: number) => text(label, x, labelY, textLight, 18, 500);
  const colValue = (value: string, x: number, color: string, size: number, weight = 700) =>
    text(value, x, valueY, color, size, weight);

  // 品牌方（左对齐）
  colLabel('品牌方', colX[0]);
  colValue(input.clientName || '—', colX[0], textMain, 26, 700);

  // 发布日期（居中，紫色加粗大字）
  const pubValue = formatDateCn(input.pubDate) ? `${formatDateCn(input.pubDate)}` : '待定';
  colLabel('发布日期', colX[1]);
  colValue(pubValue, colX[1], purpleDeep, 28, 800);

  // 当前进度（右对齐，格式 "大纲 · 第N/8阶段" / 已完结）
  const firstNotDone = input.stages.findIndex((s) => !s.done);
  const allDone = firstNotDone === -1 || firstNotDone >= input.stages.length;
  let curProg = '已完结';
  if (!allDone) {
    const curIdx = firstNotDone; // 0-based 第一个未完成 = 当前阶段
    curProg = `${input.stages[curIdx].name} · 第${curIdx + 1}/${input.stages.length}阶段`;
  }
  colLabel('当前进度', colX[2]);
  text(curProg, colX[2], valueY, purpleDeep, 22, 800, 'right');

  const infoBottom = cardY + cardH + 26;

  // ============= 区块3：8阶段时间线（行高舒展，参考稿节奏） =============
  const topY = infoBottom;
  const stages = input.stages;
  const N = stages.length;
  // 当前阶段行高显著更大（第一行≈1.2倍），其余行稍小
  const ROW_H_MAIN = 132; // 当前阶段行
  const ROW_H = 118; // 其余行
  const lineX = cardX; // 时间线竖轴 x（节点圆心）

  let y = topY;
  const rowHs = stages.map((st, idx) => {
    const isDone = !!st.done;
    const isCurrent = !isDone && (idx === 0 || !!stages[idx - 1]?.done);
    return isCurrent ? ROW_H_MAIN : ROW_H;
  });
  // 绘制竖轴连线：从首个节点圆心向上、以及各节点圆心向下到下一记录行圆心
  stages.forEach((st, idx) => {
    const isDone = !!st.done;
    const isCurrent = !isDone && (idx === 0 || !!stages[idx - 1]?.done);
    const rowH = rowHs[idx];
    const cy = y + rowH / 2; // 圆心
    const nodeR = isDone ? 20 : isCurrent ? 26 : 15;

    // 当前阶段整行通栏浅紫底高亮（跨越到页边距，营造通栏）
    if (isCurrent) {
      ctx.fillStyle = purpleSoft;
      roundRect(PX, y, W_INNER, ROW_H_MAIN, 20);
      ctx.fill();
    }

    // 竖轴连线（节点圆之间，圆处断开）：从圆心到下一行圆心
    const nextY = y + rowH + (idx + 1 < N ? rowHs[idx + 1] / 2 - 14 : 0);
    ctx.strokeStyle = isDone || isCurrent ? '#D6C8F5' : '#D9D4CB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lineX, cy + nodeR + 2);
    ctx.lineTo(lineX, idx + 1 < N ? nextY - 14 : nextY);
    ctx.stroke();

    // 节点圆
    if (isDone) {
      // 实心绿圆 + 白勾
      ctx.fillStyle = doneGreen;
      ctx.beginPath();
      ctx.arc(lineX, cy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white;
      ctx.font = font(800, 22);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('✓', lineX - 1, cy - 12);
    } else if (isCurrent) {
      // 放大紫色大圆 + 白字序号
      const r = 26;
      ctx.fillStyle = purple;
      ctx.beginPath();
      ctx.arc(lineX, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white;
      ctx.font = font(800, 26);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${idx + 1}`, lineX - 1, cy - 15);
    } else {
      // 浅灰空心圆（连线在圆处断开）
      ctx.strokeStyle = '#C3C7CF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(lineX, cy, 15, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 阶段名 + 状态徽章 + 日期 —— 当前行字号约1.15~1.2倍
    const nameSize = isCurrent ? 34 : 30;
    const statusSize = isCurrent ? 19 : 17;
    const dateSize = isCurrent ? 26 : 23;
    const nameX = lineX + 44;
    const nameY = cy - (isCurrent ? 34 : 28);
    const nameColor = isDone ? doneGreenText : isCurrent ? purpleDeep : textMain;

    // 阶段名（当前行大一号加粗）
    text(st.name, nameX, nameY, nameColor, nameSize, isCurrent ? 800 : 700);

    // 状态徽章（当前行=描边胶囊"进行中"；未开始=灰底胶囊）
    let statusText = '未开始';
    let statusBg = grayChip;
    let statusColor = textLight;
    let statusBorder: string | null = null;
    if (isDone) {
      statusText = '已完成';
      statusBg = '#D9F5E3';
      statusColor = doneGreenText;
    } else if (isCurrent) {
      statusText = '进行中';
      statusBg = white;
      statusColor = purple;
      statusBorder = purpleBorder;
    }
    const statusW = measureText(statusText, statusSize) + 30;
    const statusH = isCurrent ? 40 : 36;
    const statusX = nameX + measureText(st.name, nameSize) + 18;
    const statusY = nameY + (nameSize - statusH) / 2 + 4;
    ctx.fillStyle = statusBg;
    roundRect(statusX, statusY, statusW, statusH, statusH / 2);
    ctx.fill();
    if (statusBorder) {
      ctx.strokeStyle = statusBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    text(statusText, statusX + statusW / 2, statusY + (statusH - statusSize) / 2 + 1, statusColor, statusSize, 600, 'center');

    // 日期（右对齐）
    const dateLabel = formatDateCn(st.date) ?? '待定';
    text(dateLabel, cardRight, nameY + 2, isCurrent ? purpleDeep : textSub, dateSize, isCurrent ? 700 : 500, 'right');

    y += rowH;
  });

  const timelineBottom = y;

  // ============= 区块4：进度摘要条（实心紫色圆角条 + 白字） =============
  const doneCount = stages.filter((s) => s.done).length;
  const firstTodoIdx = stages.findIndex((s) => !s.done);
  const allDoneCount = firstTodoIdx === -1 || firstTodoIdx >= stages.length;
  const doingCount = allDoneCount ? 0 : 1; // 第一个未完成阶段 = 进行中
  const todoCount = stages.length - doneCount - doingCount;
  // 距发布天数
  let daysToPub = '';
  if (input.pubDate && formatDateCn(input.pubDate)) {
    const d = diffDaysFromToday(input.pubDate);
    if (d >= 0) daysToPub = `${d} 天`;
    else daysToPub = '已发布';
  } else {
    daysToPub = '待定';
  }

  const sumY = timelineBottom + 26;
  const sumH = 66;
  const sumRadius = 24;
  ctx.fillStyle = purpleDeep;
  roundRect(PX, sumY, W_INNER, sumH, sumRadius);
  ctx.fill();
  const sumText = `已完成 ${doneCount}  ·  进行中 ${doingCount}  ·  未开始 ${todoCount}  ·  距发布 ${daysToPub}`;
  ctx.fillStyle = white;
  ctx.font = font(700, 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(sumText, W / 2, sumY + 21);

  // ============= 区块5：底部 =============
  const footY = H - 66;
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PX, footY - 22);
  ctx.lineTo(W - PX, footY - 22);
  ctx.stroke();
  // 左：生成于 ...
  ctx.textAlign = 'left';
  text(buildGeneratedLabel(), PX, footY, textSub, 18, 500);
  // 右：项目进度如有调整，将同步更新
  text('项目进度如有调整，将同步更新', W - PX, footY, textLight, 18, 400, 'right');

  return canvas.toDataURL('image/png');
}