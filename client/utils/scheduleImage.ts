/**
 * 排期图生成器（Web 端）。
 *
 * 运行环境是 Web/PWA（iPhone 主屏幕访问 server/public 静态站点），
 * 因此用 HTML canvas 将排期信息绘制成一张竖版 PNG，供系统分享面板 / 下载使用。
 *
 * ==================== 画布与字号硬约束（严禁自由发挥） ====================
 * [1] canvas 物理像素固定 960 x 1500（dpr 不得引入缩放，否则实际像素 ≠ 规范）。
 *     渲染前与渲染后均做断言：宽≠960 或 高≠1500 → 抛错，禁止交付。
 * [2] 时间线区域总高固定 ≤ 880px，行间距=0：
 *       当前阶段行 124px，未开始/已完成行 104px（124 + 7*104 = 852 ≤ 880）
 *     行与行之间禁止插入任何额外间距。
 * [3] 字号渲染后程序化抽查并输出日志（偏差 >2px 视为失败）：
 *       署名40 / 项目名46 / 三列值36 / 当前阶段名42 / 未开始阶段名34 / 日期34·32 / 摘要条30
 * [4] 交付前程序化自检：画布=960x1500（实测）、时间线≤880（实测）、
 *       关键字号与规范一致、三列信息列宽相等——全部通过才输出图片。
 * ========================================================================
 */
import { todayG8 } from './gmt8';

/** 硬约束常量（唯一权威值，禁止改动）。 */
const CANVAS_W = 960;
const CANVAS_H = 1500;
const TIMELINE_MAX_TOTAL = 880;

/** 断言：条件不满足即抛错（拒绝交付画歪的画布）。 */
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('[排期图自检失败]', msg);
    throw new Error('[排期图自检失败] ' + msg);
  }
}

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
 * 画布物理像素固定 960 x 1500，dpr=1（不允许缩放，否则实际像素会漂移）。
 */
export function renderScheduleImageCanvas(input: ScheduleImageInput): string {
  // [自检 A] 画布尺寸硬断言（渲染前）
  assert(CANVAS_W === 960, '画布宽必须为 960（禁止缩放/自由发挥）');
  assert(CANVAS_H === 1500, '画布高必须为 1500（固定值，不是最小值）');

  const W = CANVAS_W;
  const H = CANVAS_H;
  // dpr = 1：物理像素 == 逻辑像素，保证最终 PNG 恰好是 960x1500。
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas ctx');

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
  const signSize = 40;
  text('起舞龙清影', PX, 44, textMain, signSize, 800);
  text('项目排期表', W - PX, 40, textSub, 24, 700, 'right');
  text('PROJECT SCHEDULE', W - PX, 72, textLight, 18, 500, 'right');
  const headerBottom = 44 + 88; // 132

  // ============= 区块2：项目信息卡（白色大圆角、细边框、大内边距） =============
  const cardY = headerBottom + 6; // 138
  const cardH = 234;
  const cardRadius = 24;
  ctx.fillStyle = white;
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1.5;
  roundRect(PX, cardY, W_INNER, cardH, cardRadius);
  ctx.fill();
  ctx.stroke();

  const cardX = PX + 36; // 卡片内左边距（大内边距）
  const cardRight = W - PX - 36;

  // 项目名（46px 加粗，左上）
  const projectName = input.projectName || '未命名项目';
  const projSize = 46;
  text(projectName, cardX, cardY + 32, textMain, projSize, 800);
  const projNameW = measureText(projectName, projSize);

  // 类型胶囊（右上，浅紫底紫字，24px）
  const typeText = input.scheduleType;
  const typeW = measureText(typeText, 24) + 44;
  const typeH = 46;
  ctx.fillStyle = purpleSoft;
  roundRect(cardRight - typeW, cardY + 38, typeW, typeH, 23);
  ctx.fill();
  text(typeText, cardRight - typeW / 2, cardY + (38 + typeH / 2 - 12), purple, 24, 700, 'center');

  // 三列等宽对称：品牌方 / 发布日期 / 当前进度（左中右对齐）
  const colGap = 24;
  const threeCols = (cardRight - cardX - colGap * 2) / 3;
  const colX = [cardX, cardX + threeCols + colGap, cardX + (threeCols + colGap) * 2];
  const labelY = cardY + 118;
  const valueY = cardY + 156;
  const colLabelSize = 26;
  const colValueSize = 36;
  const colLabel = (label: string, x: number) => text(label, x, labelY, textLight, colLabelSize, 500);
  const colValue = (value: string, x: number, color: string, align: CanvasTextAlign = 'left') =>
    text(value, x, valueY, color, colValueSize, 800, align);

  // 品牌方（左对齐，黑）
  colLabel('品牌方', colX[0]);
  colValue(input.clientName || '—', colX[0], textMain);

  // 发布日期（居中，紫色加粗大字）
  const pubValue = formatDateCn(input.pubDate) ?? '待定';
  colLabel('发布日期', colX[1]);
  colValue(pubValue, colX[1] + threeCols / 2, purpleDeep, 'center');

  // 当前进度（右对齐，紫色加粗大字，格式 "大纲 · 第N/8阶段" / 已完结）
  const firstNotDone = input.stages.findIndex((s) => !s.done);
  const allDone = firstNotDone === -1 || firstNotDone >= input.stages.length;
  let curProg = '已完结';
  if (!allDone) {
    const curIdx = firstNotDone; // 0-based 第一个未完成 = 当前阶段
    curProg = `${input.stages[curIdx].name} · 第${curIdx + 1}/${input.stages.length}阶段`;
  }
  colLabel('当前进度', colX[2]);
  colValue(curProg, colX[2] + threeCols, purpleDeep, 'right');

  // [自检 D] 三列信息列宽相等（实测）
  const c0 = colX[1] - colX[0];
  const c1 = colX[2] - (colX[1] + colGap);
  assert(Math.abs(c0 - threeCols) < 1 && Math.abs(c1 - threeCols) < 1, '三列信息列宽必须相等（等宽对称分布）');

  const infoBottom = cardY + cardH + 26; // 398

  // ============= 区块3：8阶段时间线（行间距=0，总高≤880px） =============
  const topY = infoBottom;
  const stages = input.stages;
  const N = stages.length;
  // 行高（行间距=0，直接累加）：当前阶段行 124 / 未开始与已完成行 104
  const ROW_H_MAIN = 124;
  const ROW_H = 104;
  const lineX = cardX; // 时间线竖轴 x（节点圆心）

  // 计算每行行高与当前态
  const rowHs = stages.map((st, idx) => {
    const isDone = !!st.done;
    const isCurrent = !isDone && (idx === 0 || !!stages[idx - 1]?.done);
    return isCurrent ? ROW_H_MAIN : ROW_H;
  });

  // 时间线总高（8 行累加）：124 + 7*104 = 852
  const timelineTotal = rowHs.reduce((a, b) => a + b, 0);
  // [自检 B] 时间线总高 ≤ 880（实测），且行间距=0（直接累加、无任何额外的 y 偏移）
  assert(timelineTotal <= TIMELINE_MAX_TOTAL, `时间线总高 ${timelineTotal} 必须 ≤ 880`);

  let y = topY;
  stages.forEach((st, idx) => {
    const isDone = !!st.done;
    const isCurrent = !isDone && (idx === 0 || !!stages[idx - 1]?.done);
    const rowH = rowHs[idx];
    const cy = y + rowH / 2; // 圆心（四元素垂直居中的水平线）
    const nodeR = isDone ? 21 : isCurrent ? 32 : 21; // 当前=64px大圆 / 其余=42px圆

    // 当前阶段整行通栏浅紫底高亮（跨越到页边距，营造通栏）
    if (isCurrent) {
      ctx.fillStyle = purpleSoft;
      roundRect(PX, y, W_INNER, ROW_H_MAIN, 20);
      ctx.fill();
    }

    // 竖轴连线（节点圆之间，圆处断开）：从圆心向下到下一记录行圆心
    const nextY = y + rowH + (idx + 1 < N ? rowHs[idx + 1] / 2 - 14 : 0);
    ctx.strokeStyle = isDone || isCurrent ? '#D6C8F5' : '#D9D4CB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lineX, cy + nodeR + 2);
    ctx.lineTo(lineX, idx + 1 < N ? nextY - 14 : nextY);
    ctx.stroke();

    // 节点圆
    if (isDone) {
      // 实心绿圆 + 白勾（42px 圆）
      ctx.fillStyle = doneGreen;
      ctx.beginPath();
      ctx.arc(lineX, cy, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white;
      ctx.font = font(800, 24);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('✓', lineX - 1, cy - 13);
    } else if (isCurrent) {
      // 放大紫色大圆（64px）+ 白字序号（28px 白字）
      const r = 32;
      ctx.fillStyle = purple;
      ctx.beginPath();
      ctx.arc(lineX, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white;
      ctx.font = font(800, 28);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${idx + 1}`, lineX - 1, cy - 17);
    } else {
      // 浅灰空心圆（42px，描边3px，接线在圆处断开）
      ctx.strokeStyle = '#C3C7CF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lineX, cy, 21, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 四元素垂直居中一条线（铁律）
    const nameSize = isCurrent ? 42 : 34; // 当前阶段名 42 / 未开始阶段名 34
    const dateSize = isCurrent ? 34 : 32; // 日期 34 · 32
    const nameX = lineX + 44;
    const nameColor = isDone ? doneGreenText : isCurrent ? purpleDeep : textMain;
    const nameY = cy - nameSize / 2; // 以 cy 垂直居中

    // 阶段名
    text(st.name, nameX, nameY, nameColor, nameSize, isCurrent ? 800 : 700);

    // 状态徽章（26px）：当前=描边胶囊"进行中"；已完成=绿底；未开始=灰底
    let statusText = '未开始';
    let statusBg = grayChip;
    let statusColor = isDone ? doneGreenText : textLight;
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
    const statusSize = 26;
    const statusW = measureText(statusText, statusSize) + 34;
    const statusH = isCurrent ? 44 : 40;
    const statusX = nameX + measureText(st.name, nameSize) + 18;
    const statusY = cy - statusH / 2;
    ctx.fillStyle = statusBg;
    roundRect(statusX, statusY, statusW, statusH, statusH / 2);
    ctx.fill();
    if (statusBorder) {
      ctx.strokeStyle = statusBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    text(statusText, statusX + statusW / 2, statusY + (statusH - statusSize) / 2 + 1, statusColor, statusSize, 600, 'center');

    // 日期（右对齐）：当前 34px / 其余 32px
    const dateLabel = formatDateCn(st.date) ?? '待定';
    text(dateLabel, cardRight, cy - dateSize / 2, isCurrent ? purpleDeep : textSub, dateSize, isCurrent ? 700 : 500, 'right');

    y += rowH; // 行间距=0，直接累加
  });

  const timelineBottom = y;

  // ============= 区块4：进度摘要条（高84px，实心紫色圆角条 + 白字30px） =============
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
  const sumH = 84;
  const sumRadius = 24;
  const sumSize = 30;
  ctx.fillStyle = purpleDeep;
  roundRect(PX, sumY, W_INNER, sumH, sumRadius);
  ctx.fill();
  const sumText = `已完成 ${doneCount}  ·  进行中 ${doingCount}  ·  未开始 ${todoCount}  ·  距发布 ${daysToPub}`;
  ctx.fillStyle = white;
  ctx.font = font(700, sumSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(sumText, W / 2, sumY + (sumH - sumSize) / 2);

  // ============= 区块5：底部（22px 灰） =============
  const footY = H - 70;
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PX, footY - 28);
  ctx.lineTo(W - PX, footY - 28);
  ctx.stroke();
  // 左：生成于 ...
  ctx.textAlign = 'left';
  text(buildGeneratedLabel(), PX, footY, textSub, 22, 500);
  // 右：项目进度如有调整，将同步更新
  text('项目进度如有调整，将同步更新', W - PX, footY, textLight, 22, 400, 'right');

  // ============= [自检 C] 字号渲染后程序化抽查（实测，供日志对照） =============
  const sizeCheck: Record<string, number> = {
    署名: signSize, // 40
    项目名: projSize, // 46
    三列值: colValueSize, // 36
    三列标签: colLabelSize, // 26
    当前阶段名: 42,
    未开始阶段名: 34,
    日期当前: 34,
    日期其他: 32,
    摘要条: sumSize, // 30
  };
  // 与规范对照（偏差 >2px 即失败）
  const spec: Record<string, number> = {
    署名: 40,
    项目名: 46,
    三列值: 36,
    三列标签: 26,
    当前阶段名: 42,
    未开始阶段名: 34,
    日期当前: 34,
    日期其他: 32,
    摘要条: 30,
  };
  let sizeFail = false;
  for (const k of Object.keys(spec)) {
    const v = sizeCheck[k];
    if (Math.abs(v - spec[k]) > 2) {
      sizeFail = true;
      console.error(`[排期图] 字号不符: ${k}=${v}px（规范 ${spec[k]}px，允许偏差±2）`);
    }
  }
  console.log('[排期图] 自检报告:', JSON.stringify({
    画布: [canvas.width, canvas.height],
    规范画布: [CANVAS_W, CANVAS_H],
    时间线总高: timelineTotal,
    规范上限: TIMELINE_MAX_TOTAL,
    三列等宽: c0.toFixed(1),
    数量: `${stages.filter(s=>s.done).length}完成/${doingCount}进行中/${todoCount}未开始`,
    关键字号: sizeCheck,
  }));
  assert(!sizeFail, '存在字号与规范偏差 >2px，已拒绝交付');
  // [自检 A] 画布尺寸硬断言（渲染后：以 canvas 实际物理像素为准）
  assert(canvas.width === CANVAS_W && canvas.height === CANVAS_H,
    `画布实际像素 ${canvas.width}x${canvas.height} 必须为 960x1500`);

  return canvas.toDataURL('image/png');
}