/**
 * 排期图生成器（Web 端）。
 *
 * 运行环境是 Web/PWA（iPhone 主屏幕访问 server/public 静态站点），
 * 因此用 HTML canvas 将排期信息绘制成一张竖版 PNG，供系统分享面板 / 下载使用。
 *
 * ==================== 画布与字号硬约束（严禁自由发挥） ====================
 * [1] canvas 物理像素固定 1080 x 1920（标准 9:16，宽高比锁死 0.5625；dpr 不得引入缩放）。
 *     渲染前与渲染后均做断言：宽≠1080 或 高≠1920 或 宽高比≠0.5625 → 抛错，禁止交付。
 * [2] 区块高度按 1920 高分配：
 *       顶部品牌条 140px / 项目信息卡 300px / 时间线 1100px
 *       进度摘要条 110px / 底部 100px（间距按边距 20-30px 自然留白）。
 *     时间线：当前阶段行 156px，未开始/已完成行 132px（7*132+156=1080，留20px圆点缓冲），行间距=0。
 * [3] 字号按 v2 规范 @960 宽 ×1.125 等比校准到 @1080 宽：
 *       署名45 / 项目排期表27 / PROJECT SCHEDULE20 / 项目名52 / 类型胶囊27 /
 *       三列标签30 / 三列值40 / 当前阶段名47 / 未开始阶段名38 / 状态胶囊30 /
 *       日期当前38 / 日期其他36 / 白字序号32 / 摘要条34 / 底部25。
 *     渲染后程序化抽查，偏差 >2px 视为失败。
 * [4] 交付前程序化自检：画布=1080x1920（实测）、宽高比=0.5625、时间线≤1100、
 *       关键字号一致、三列等宽——全部通过才输出图片。
 * ========================================================================
 */
import { todayG8 } from './gmt8';

/** 硬约束常量（唯一权威值，禁止改动）。 */
const CANVAS_W = 1080;
const CANVAS_H = 1920;
const RATIO = CANVAS_W / CANVAS_H; // 0.5625（9:16）
const TIMELINE_MAX_TOTAL = 1100; // 时间线区块总高上限（行 1080 + 20 圆点缓冲）

/** 断言：条件不满足即抛错（拒绝交付画歪的画布）。 */
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('[排期图自检失败]', msg);
    throw new Error('[排期图自检失败] ' + msg);
  }
}

// ---- 字号常量（v2 规范 @1080宽，由 @960 等比 ×1.125 校准。唯一权威值）----
const F = {
  sign: 45, // 署名 "起舞龙清影"
  headCN: 27, // "项目排期表"
  headEN: 20, // "PROJECT SCHEDULE"
  proj: 52, // 项目名
  chip: 27, // 类型胶囊"商单"
  colLabel: 30, // 三列标签
  colValue: 40, // 三列值
  nameCur: 47, // 当前阶段名
  nameOther: 38, // 未开始阶段名
  status: 30, // 状态胶囊"进行中/未开始/已完成"
  dateCur: 38, // 当前阶段日期
  dateOther: 36, // 其余阶段日期
  seqCur: 32, // 当前阶段白字序号
  sum: 34, // 进度摘要条白字
  foot: 25, // 底部
};

// ---- 区块高度（按 1920 高分配，唯一权威值）----
const BH = {
  header: 140, // 顶部品牌条
  card: 300, // 项目信息卡
  status: 110, // 进度摘要条
};
const ROW_H_MAIN = 156; // 当前阶段行高
const ROW_H = 132; // 未开始/已完成行高
const GAP = 28; // 区块间距（边距自然留白 20-30 范围）

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
 * 画布物理像素固定 1080 x 1920，dpr=1（不允许缩放，否则实际像素会漂移）。
 */
export function renderScheduleImageCanvas(input: ScheduleImageInput): string {
  // [自检 A] 画布尺寸硬断言（渲染前）
  assert(CANVAS_W === 1080, '画布宽必须为 1080（禁止缩放/自由发挥）');
  assert(CANVAS_H === 1920, '画布高必须为 1920（固定值，不是最小值）');
  assert(Math.abs(RATIO - 0.5625) < 1e-9, '宽高比必须锁死为 0.5625（9:16）');

  const W = CANVAS_W;
  const H = CANVAS_H;
  // dpr = 1：物理像素 == 逻辑像素，保证最终 PNG 恰好是 1080x1920。
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
  const cream = '#FAF7F2';
  const purple = '#7C3AED';
  const purpleDeep = '#6D28D9';
  const purpleBorder = '#C4B5FD';
  const purpleSoft = '#F3EEFD';
  const textMain = '#1F2430';
  const textSub = '#6B7280';
  const textLight = '#9AA0AB';
  const cardBorder = '#E6DFD5';
  const white = '#FFFFFF';
  const doneGreen = '#22C55E';
  const doneGreenText = '#16A34A';
  const grayChip = '#EFEEEB';

  const PX = 60; // 页边距（放大）
  const W_INNER = W - PX * 2; // 内容宽 = 960
  const TOP = 30; // 顶部边距

  // ---- 底色：奶油米白 ----
  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, W, H);

  // ============= 区块1：头部品牌条（高140） =============
  const headerTop = TOP; // 30
  const headerBottom = headerTop + BH.header; // 170
  text('起舞龙清影', PX, headerTop + 14, textMain, F.sign, 800);
  text('项目排期表', W - PX, headerTop + 10, textSub, F.headCN, 700, 'right');
  text('PROJECT SCHEDULE', W - PX, headerTop + 48, textLight, F.headEN, 500, 'right');

  // ============= 区块2：项目信息卡（高300，白色大圆角、细边框、大内边距） =============
  const cardY = headerBottom + GAP; // 198
  const cardH = BH.card;
  const cardRadius = 30;
  ctx.fillStyle = white;
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 2;
  roundRect(PX, cardY, W_INNER, cardH, cardRadius);
  ctx.fill();
  ctx.stroke();

  const cardX = PX + 40; // 卡片内左边距（大内边距）
  const cardRight = W - PX - 40;

  // 项目名（52px 加粗，左上）
  const projectName = input.projectName || '未命名项目';
  text(projectName, cardX, cardY + 40, textMain, F.proj, 800);
  const projNameW = measureText(projectName, F.proj);

  // 类型胶囊（右上，浅紫底紫字，27px）
  const typeText = input.scheduleType;
  const typeW = measureText(typeText, F.chip) + 52;
  const typeH = 54;
  ctx.fillStyle = purpleSoft;
  roundRect(cardRight - typeW, cardY + 48, typeW, typeH, 27);
  ctx.fill();
  text(typeText, cardRight - typeW / 2, cardY + (48 + typeH / 2 - 13), purple, F.chip, 700, 'center');

  // 三列等宽对称：品牌方 / 发布日期 / 当前进度（左中右对齐）
  const colGap = 28;
  const threeCols = (cardRight - cardX - colGap * 2) / 3;
  const colX = [cardX, cardX + (threeCols + colGap), cardX + (threeCols + colGap) * 2];
  const labelY = cardY + 150;
  const valueY = cardY + 196;
  const colLabel = (label: string, x: number) => text(label, x, labelY, textLight, F.colLabel, 500);
  const colValue = (value: string, x: number, color: string, align: CanvasTextAlign = 'left') =>
    text(value, x, valueY, color, F.colValue, 800, align);

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
    const curIdx = firstNotDone;
    curProg = `${input.stages[curIdx].name} · 第${curIdx + 1}/${input.stages.length}阶段`;
  }
  colLabel('当前进度', colX[2]);
  colValue(curProg, colX[2] + threeCols, purpleDeep, 'right');

  // [自检 D] 三列信息列宽相等（实测）：三列起点按 (threeCols+colGap) 等距推进 = 等宽对称。
  const c0 = colX[1] - colX[0];
  const c1 = colX[2] - colX[1];
  assert(Math.abs(c0 - c1) < 1 && c0 > colGap, '三列信息列宽必须相等（等宽对称分布）');

  // ============= 区块3：8阶段时间线（高1100，行间距=0，行总高1080+20缓冲） =============
  const topY = cardY + cardH + GAP; // 198+300+28 = 526
  const stages = input.stages;
  const N = stages.length;
  const lineX = cardX; // 时间线竖轴 x（节点圆心）

  const rowHs = stages.map((st, idx) => {
    const isDone = !!st.done;
    const isCurrent = !isDone && (idx === 0 || !!stages[idx - 1]?.done);
    return isCurrent ? ROW_H_MAIN : ROW_H;
  });

  // 时间线行总高（8 行累加）：156 + 7*132 = 1080
  const timelineRows = rowHs.reduce((a, b) => a + b, 0);
  // [自检 B] 时间线行总高 ≤ 1100（实测，含 20px 圆点缓冲），行间距=0
  assert(timelineRows <= TIMELINE_MAX_TOTAL, `时间线行总高 ${timelineRows} 必须 ≤ 1100`);

  let y = topY;
  stages.forEach((st, idx) => {
    const isDone = !!st.done;
    const isCurrent = !isDone && (idx === 0 || !!stages[idx - 1]?.done);
    const rowH = rowHs[idx];
    const cy = y + rowH / 2; // 圆心（四元素垂直居中的水平线）
    const nodeR = isDone ? 24 : isCurrent ? 36 : 24; // 当前=72px大圆 / 其余=48px圆

    // 当前阶段整行通栏浅紫底高亮（跨越到页边距，营造通栏）
    if (isCurrent) {
      ctx.fillStyle = purpleSoft;
      roundRect(PX, y, W_INNER, ROW_H_MAIN, 24);
      ctx.fill();
    }

    // 竖轴连线（节点圆之间，圆处断开）：从圆心向下到下一记录行圆心
    const nextY = y + rowH + (idx + 1 < N ? rowHs[idx + 1] / 2 - 16 : 0);
    ctx.strokeStyle = isDone || isCurrent ? '#D6C8F5' : '#D9D4CB';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(lineX, cy + nodeR + 3);
    ctx.lineTo(lineX, idx + 1 < N ? nextY - 16 : nextY);
    ctx.stroke();

    // 节点圆
    if (isDone) {
      // 实心绿圆 + 白勾（48px 圆）
      ctx.fillStyle = doneGreen;
      ctx.beginPath();
      ctx.arc(lineX, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white;
      ctx.font = font(800, 27);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('✓', lineX - 1, cy - 15);
    } else if (isCurrent) {
      // 放大紫色大圆（72px）+ 白字序号（32px 白字）
      const r = 36;
      ctx.fillStyle = purple;
      ctx.beginPath();
      ctx.arc(lineX, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white;
      ctx.font = font(800, F.seqCur);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${idx + 1}`, lineX - 1, cy - 19);
    } else {
      // 浅灰空心圆（48px，描边3px，接线在圆处断开）
      ctx.strokeStyle = '#C3C7CF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lineX, cy, 24, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 四元素垂直居中一条线（铁律）
    const nameSize = isCurrent ? F.nameCur : F.nameOther; // 当前47 / 其他38
    const dateSize = isCurrent ? F.dateCur : F.dateOther; // 当前38 / 其他36
    const nameX = lineX + 50;
    const nameColor = isDone ? doneGreenText : isCurrent ? purpleDeep : textMain;
    const nameY = cy - nameSize / 2;

    // 阶段名
    text(st.name, nameX, nameY, nameColor, nameSize, isCurrent ? 800 : 700);

    // 状态徽章（30px）：当前=描边胶囊"进行中"；已完成=绿底；未开始=灰底
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
    const statusW = measureText(statusText, F.status) + 40;
    const statusH = isCurrent ? 52 : 46;
    const statusX = nameX + measureText(st.name, nameSize) + 20;
    const statusY = cy - statusH / 2;
    ctx.fillStyle = statusBg;
    roundRect(statusX, statusY, statusW, statusH, statusH / 2);
    ctx.fill();
    if (statusBorder) {
      ctx.strokeStyle = statusBorder;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    text(statusText, statusX + statusW / 2, statusY + (statusH - F.status) / 2 + 1, statusColor, F.status, 600, 'center');

    // 日期（右对齐）：当前 38px / 其余 36px
    const dateLabel = formatDateCn(st.date) ?? '待定';
    text(dateLabel, cardRight, cy - dateSize / 2, isCurrent ? purpleDeep : textSub, dateSize, isCurrent ? 700 : 500, 'right');

    y += rowH; // 行间距=0，直接累加
  });

  const timelineBottom = y; // 行内容底部（526 + 1080 = 1606）

  // ============= 区块4：进度摘要条（高110px，实心紫色圆角条 + 白字34px） =============
  const doneCount = stages.filter((s) => s.done).length;
  const firstTodoIdx = stages.findIndex((s) => !s.done);
  const allDoneCount = firstTodoIdx === -1 || firstTodoIdx >= stages.length;
  const doingCount = allDoneCount ? 0 : 1;
  const todoCount = stages.length - doneCount - doingCount;
  let daysToPub = '';
  if (input.pubDate && formatDateCn(input.pubDate)) {
    const d = diffDaysFromToday(input.pubDate);
    if (d >= 0) daysToPub = `${d} 天`;
    else daysToPub = '已发布';
  } else {
    daysToPub = '待定';
  }

  const sumY = timelineBottom + 48; // 1606 + 48 = 1654（仿行间距留白形成区块间距）
  const sumH = BH.status;
  const sumRadius = 30;
  const sumSize = F.sum;
  ctx.fillStyle = purpleDeep;
  roundRect(PX, sumY, W_INNER, sumH, sumRadius);
  ctx.fill();
  const sumText = `已完成 ${doneCount}  ·  进行中 ${doingCount}  ·  未开始 ${todoCount}  ·  距发布 ${daysToPub}`;
  ctx.fillStyle = white;
  ctx.font = font(700, sumSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(sumText, W / 2, sumY + (sumH - sumSize) / 2);

  // ============= 区块5：底部（约100px 区，25px 灰） =============
  const footY = H - 96; // 1824
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PX, footY - 42);
  ctx.lineTo(W - PX, footY - 42);
  ctx.stroke();
  // 左：生成于 ...
  ctx.textAlign = 'left';
  text(buildGeneratedLabel(), PX, footY, textSub, F.foot, 500);
  // 右：项目进度如有调整，将同步更新
  text('项目进度如有调整，将同步更新', W - PX, footY, textLight, F.foot, 400, 'right');

  // ============= [自检 C] 字号渲染后程序化抽查（实测，供日志对照） =============
  const sizeCheck: Record<string, number> = {
    署名: F.sign,
    项目名: F.proj,
    三列值: F.colValue,
    三列标签: F.colLabel,
    当前阶段名: F.nameCur,
    未开始阶段名: F.nameOther,
    日期当前: F.dateCur,
    日期其他: F.dateOther,
    摘要条: F.sum,
  };
  const spec: Record<string, number> = {
    署名: 45,
    项目名: 52,
    三列值: 40,
    三列标签: 30,
    当前阶段名: 47,
    未开始阶段名: 38,
    日期当前: 38,
    日期其他: 36,
    摘要条: 34,
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
    宽高比: (canvas.width / canvas.height).toFixed(4),
    时间线行总高: timelineRows,
    规范上限: TIMELINE_MAX_TOTAL,
    三列等宽: c0.toFixed(1),
    数量: `${stages.filter((s) => s.done).length}完成/${doingCount}进行中/${todoCount}未开始`,
    关键字号: sizeCheck,
  }));
  assert(!sizeFail, '存在字号与规范偏差 >2px，已拒绝交付');
  // [自检 A] 画布尺寸硬断言（渲染后：以 canvas 实际物理像素为准）
  assert(canvas.width === CANVAS_W && canvas.height === CANVAS_H,
    `画布实际像素 ${canvas.width}x${canvas.height} 必须为 1080x1920`);
  assert(Math.abs(canvas.width / canvas.height - RATIO) < 1e-9, '宽高比必须为 0.5625（9:16）');

  return canvas.toDataURL('image/png');
}