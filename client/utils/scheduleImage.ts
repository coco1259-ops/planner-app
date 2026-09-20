/**
 * 排期图生成器（Web 端，PWA 下用 HTML canvas 绘制 PNG 供系统分享）。
 *
 * ==================== 画布 / 字号 / 占比硬约束（严禁自由发挥） ====================
 * [1] 画布逻辑尺寸 576 x 1088，是 9:17 的【精确整数等比】(576=9x64, 1088=17x64)，
 *     长宽比锁死 9/17 ≈ 0.529411（W/H 与 9/17 完全相等，数学恒成立）。
 *     物理像素 = 逻辑 x DPR(2) = 1152 x 2176，保证在手机 Retina 屏清晰。
 *     渲染前与渲染后均断言长宽比 + 逻辑/物理尺寸，不符合即抛错拒绝交付。
 *     （曾因采用"近似9:17"的 640×1208 整数画布导致 640/1208≠9/17、断言必失败，
 *       排期图无法生成；现改用精确 9:17 整数尺寸根治。）
 * [2] 字号沿用【字号规范 v2】的像素值（用户给定，一个都不改）：
 *       署名45 / 项目排期表27 / PROJECT SCHEDULE20 / 项目名52 / 类型胶囊27 /
 *       三列标签30 / 三列值40 / 当前阶段名47 / 未开始阶段名38 / 状态胶囊30 /
 *       日期当前38 / 日期其他36 / 白字序号32 / 摘要条34 / 底部25。
 *     关键：字号与画布逻辑宽 576 的比值即字体在画面中的占比，达到手机上正常观感
 *       （项目名≈9.0%、正文≈6.6%、标签≈5.2%）；杜绝"画布大、字小"。
 * [3] 五区块结构 / 配色 / 布局层级与既有设计完全一致：
 *       顶部品牌条 / 项目信息卡(三列) / 8阶段时间线(行间距0) / 进度摘要条 / 底部。
 * [4] 数据全部来自 App 真实数据（调用方传入 input.stages 等），不用演示数据/文字。
 *     交付前打印字号实际占比自检日志，与目标占比偏差>2 个百分点即抛错。
 * ========================================================================
 */
import { todayG8 } from './gmt8';

/** 硬约束常量（唯一权威值）。逻辑画布 576x1088，正好是精确 9:17 整数等比。 */
const CANVAS_W = 576;
const CANVAS_H = 1088;
const RATIO = 9 / 17; // 0.5294117...，576/1088 与它严格相等
const DPR = 2; // 物理像素密度，仅是清晰度，不影响字号占比。

/** 断言：条件不满足即抛错（拒绝交付画歪的画布）。 */
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('[排期图自检失败]', msg);
    throw new Error('[排期图自检失败] ' + msg);
  }
}

// ---- 字号常量（字号规范 v2 像素值，一行不改。唯一权威值）----
const F = {
  sign: 45, // 署名 "起舞龙清影"
  headCN: 27, // "项目排期表"
  headEN: 20, // "PROJECT SCHEDULE"
  proj: 52, // 项目名
  chip: 27, // 类型胶囊"商单/科普选题"
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

// ---- 区块高度（按 9:17 逻辑画布 1088 高等比分配，保持五区块结构；字号不变）----
const BH = {
  header: 80, // 顶部品牌条
  card: 170, // 项目信息卡
  status: 56, // 进度摘要条
};
const ROW_H_MAIN = 84; // 当前阶段行高（容纳 47px 阶段名 + 徽章）
const ROW_H = 70; // 未开始/已完成行高
const GAP = 16; // 区块间距
const TOP = 16; // 顶部边距

/** 将 "YYYY-MM-DD" 转成 "M月D日"。无法解析返回 null（调用方显示"待定"）。 */
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

/** GMT+8 天数差（date - today）。 */
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

/** 绘制并返回 PNG dataURL。逻辑 640x1208（9:17），物理 = 逻辑 x DPR。 */
export function renderScheduleImageCanvas(input: ScheduleImageInput): string {
  // [自检 A] 画布/比例硬断言（渲染前）
  assert(Math.abs(CANVAS_W / CANVAS_H - RATIO) < 1e-9, '画布长宽比必须为 9:17');
  assert(CANVAS_W === 576, '逻辑画布宽必须为 576');
  assert(CANVAS_H === 1088, '逻辑画布高必须为 1088');

  const W = CANVAS_W;
  const H = CANVAS_H;
  const canvas = document.createElement('canvas');
  canvas.width = W * DPR; // 1280
  canvas.height = H * DPR; // 2416
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas ctx');
  ctx.scale(DPR, DPR); // 逻辑坐标按 640x1208 绘制，字号占比以 640 为准

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

  // ---- 配色（与既有设计完全一致，奶油米白 + 紫色系）----
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

  const PX = 40; // 页边距
  const W_INNER = W - PX * 2; // 560

  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, W, H);

  // ============= 区块1：顶部品牌条 =============
  // 布局约束（本次局部调整）：
  //   - 左边"起舞龙清影"：字号占比放大（原45→72，占画布宽≈12.5%，无重叠可容纳的最大值），
  //     上下留白相同(垂直居中)、左对齐，"起"字 x=PX 与卡片左边框对齐。
  //   - 右边"项目排期表"与左署名同一条水平基线；"PROJECT SCHEDULE"行距收紧到1倍以内、右对齐，
  //     两行右边缘 x=W-PX 与卡片右边框对齐。
  const headerTop = TOP; // 16
  const signSize = 72; // 放大后的署名字号（画布宽576下可容纳的无重叠最大值）
  const pad = 18; // 品牌条上下留白（上下相同）
  const headerBottom = headerTop + signSize + pad * 2; // 16+72+36=124
  const signBaseline = headerTop + pad + signSize; // 16+18+72=106（左右两行公共基线）
  // 左：起舞龙清影（左对齐→与下方卡片左边框对齐；垂直居中）
  text('起舞龙清影', PX, signBaseline - signSize, textMain, signSize, 800);
  // 右第一行：项目排期表（与左署名同一条水平线，右对齐→与卡片右边框对齐）
  text('项目排期表', W - PX, signBaseline - F.headCN, textSub, F.headCN, 700, 'right');
  // 右第二行：PROJECT SCHEDULE（行距收紧≈1倍以内，右对齐）
  text('PROJECT SCHEDULE', W - PX, signBaseline + 8, textLight, F.headEN, 500, 'right');

  // ============= 区块2：项目信息卡（三列） =============
  const cardY = headerBottom + GAP; // 124
  const cardH = BH.card;
  const cardRadius = 20;
  ctx.fillStyle = white;
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 2;
  roundRect(PX, cardY, W_INNER, cardH, cardRadius);
  ctx.fill();
  ctx.stroke();

  const cardX = PX + 20; // 卡片内左边距
  const cardRight = W - PX - 20;

  // 项目名（52px 加粗，左上）
  const projectName = input.projectName || '未命名项目';
  text(projectName, cardX, cardY + 26, textMain, F.proj, 800);

  // 类型胶囊（右上，浅紫底紫字）
  const typeText = input.scheduleType;
  const typeW = measureText(typeText, F.chip) + 34;
  const typeH = 34;
  ctx.fillStyle = purpleSoft;
  roundRect(cardRight - typeW, cardY + 30, typeW, typeH, 17);
  ctx.fill();
  text(typeText, cardRight - typeW / 2, cardY + (30 + typeH / 2 - 13), purple, F.chip, 700, 'center');

  // 三列等宽对称：品牌方 / 发布日期 / 当前进度（左中右对齐）
  const colGap = 22;
  const threeCols = (cardRight - cardX - colGap * 2) / 3;
  const colX = [cardX, cardX + (threeCols + colGap), cardX + (threeCols + colGap) * 2];
  const labelY = cardY + 92;
  const valueY = cardY + 128;
  const colLabel = (label: string, x: number) => text(label, x, labelY, textLight, F.colLabel, 500);
  const colValue = (value: string, x: number, color: string, align: CanvasTextAlign = 'left') => {
    // 值在尽量保持规范 40px 字号的前提下，若超出列宽则温和降字号（≥26px）防止溢出；结构不变
    let size = F.colValue;
    const avail = threeCols - 2;
    while (measureText(value, size) > avail && size > 26) size -= 2;
    text(value, x, valueY, color, size, 800, align);
  };

  // 品牌方（左对齐，黑）
  colLabel('品牌方', colX[0]);
  colValue(input.clientName || '—', colX[0], textMain);

  // 发布日期（居中，紫色加粗）
  const pubValue = formatDateCn(input.pubDate) ?? '待定';
  colLabel('发布日期', colX[1]);
  colValue(pubValue, colX[1] + threeCols / 2, purpleDeep, 'center');

  // 当前进度（右对齐，紫色加粗，格式 "第N/8阶段 · 阶段名"；超宽时简化为 "第N/8阶段"）
  const firstNotDone = input.stages.findIndex((s) => !s.done);
  const allDone = firstNotDone === -1 || firstNotDone >= input.stages.length;
  let curProg = '已完结';
  if (!allDone) {
    const ci = firstNotDone;
    curProg = `${input.stages[ci].name} · 第${ci + 1}/${input.stages.length}阶段`;
    if (measureText(curProg, F.colValue) > threeCols - 2) curProg = `第${ci + 1}/${input.stages.length}阶段`;
  }
  colLabel('当前进度', colX[2]);
  colValue(curProg, colX[2] + threeCols, purpleDeep, 'right');

  // [自检 D] 三列等宽对称（实测）
  const c0 = colX[1] - colX[0];
  const c1 = colX[2] - colX[1];
  assert(Math.abs(c0 - c1) < 1 && c0 > colGap, '三列信息列宽必须相等（等宽对称分布）');

  // ============= 区块3：8阶段时间线（行间距=0） =============
  const topY = cardY + cardH + GAP; // 328
  const stages = input.stages;
  const N = stages.length;
  const lineX = cardX;

  const rowHs = stages.map((st, idx) => {
    const isDone = !!st.done;
    const isCurrent = !isDone && (idx === 0 || !!stages[idx - 1]?.done);
    return isCurrent ? ROW_H_MAIN : ROW_H;
  });
  const timelineRows = rowHs.reduce((a, b) => a + b, 0); // 84 + 7*70 = 574

  let y = topY;
  stages.forEach((st, idx) => {
    const isDone = !!st.done;
    const isCurrent = !isDone && (idx === 0 || !!stages[idx - 1]?.done);
    const rowH = rowHs[idx];
    const cy = y + rowH / 2;
    const nodeR = isDone ? 15 : isCurrent ? 24 : 15;

    if (isCurrent) {
      ctx.fillStyle = purpleSoft;
      roundRect(PX, y, W_INNER, ROW_H_MAIN, 16);
      ctx.fill();
    }

    const nextY = y + rowH + (idx + 1 < N ? rowHs[idx + 1] / 2 - 10 : 0);
    ctx.strokeStyle = isDone || isCurrent ? '#D6C8F5' : '#D9D4CB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lineX, cy + nodeR + 2);
    ctx.lineTo(lineX, idx + 1 < N ? nextY - 10 : nextY);
    ctx.stroke();

    if (isDone) {
      // 实心绿圆 + 白勾
      ctx.fillStyle = doneGreen;
      ctx.beginPath();
      ctx.arc(lineX, cy, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white;
      ctx.font = font(800, 18);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('✓', lineX - 1, cy - 9);
    } else if (isCurrent) {
      // 放大紫圆（48px）+ 白字序号（32px）
      ctx.fillStyle = purple;
      ctx.beginPath();
      ctx.arc(lineX, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = white;
      ctx.font = font(800, F.seqCur);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${idx + 1}`, lineX - 1, cy - 19);
    } else {
      // 浅灰空心圆（30px）
      ctx.strokeStyle = '#C3C7CF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lineX, cy, 15, 0, Math.PI * 2);
      ctx.stroke();
    }

    const nameSize = isCurrent ? F.nameCur : F.nameOther;
    const dateSize = isCurrent ? F.dateCur : F.dateOther;
    const nameX = lineX + 34;
    const nameColor = isDone ? doneGreenText : isCurrent ? purpleDeep : textMain;
    const nameY = cy - nameSize / 2;

    text(st.name, nameX, nameY, nameColor, nameSize, isCurrent ? 800 : 700);

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
    const statusW = measureText(statusText, F.status) + 26;
    const statusH = isCurrent ? 34 : 30;
    const statusX = nameX + measureText(st.name, nameSize) + 14;
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

    const dateLabel = formatDateCn(st.date) ?? '待定';
    text(dateLabel, cardRight, cy - dateSize / 2, isCurrent ? purpleDeep : textSub, dateSize, isCurrent ? 700 : 500, 'right');

    y += rowH;
  });
  const timelineBottom = y; // 966

  // ============= 区块4：进度摘要条 =============
  const doneCount = stages.filter((s) => s.done).length;
  const firstTodoIdx = stages.findIndex((s) => !s.done);
  const allDoneCount = firstTodoIdx === -1 || firstTodoIdx >= stages.length;
  const doingCount = allDoneCount ? 0 : 1;
  const todoCount = stages.length - doneCount - doingCount;
  let daysToPub = '';
  if (input.pubDate && formatDateCn(input.pubDate)) {
    const d = diffDaysFromToday(input.pubDate);
    daysToPub = d >= 0 ? `${d} 天` : '已发布';
  } else {
    daysToPub = '待定';
  }

  const sumY = timelineBottom + GAP; // 时间线之后进入进度摘要条
  const sumH = BH.status;
  const sumRadius = 20;
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

  // ============= 区块5：底部 =============
  // 底部随上方区块下移（衔接摘要条之后），用画布底部留白吸收品牌条增高的余量
  const footY = sumY + sumH + GAP + 38; // 摘要条之后留出间距，再把文字放到分割线下方
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PX, footY - 38);
  ctx.lineTo(W - PX, footY - 38);
  ctx.stroke();
  ctx.textAlign = 'left';
  text(buildGeneratedLabel(), PX, footY, textSub, F.foot, 500);
  text('项目进度如有调整，将同步更新', W - PX, footY, textLight, F.foot, 400, 'right');

  // ============= [自检 C] 字号实际占画布宽比例自检（对照目标占比，偏差>2个百分点 抛错） =============
  const ratio = (v: number) => (v / W) * 100; // 字占画布宽百分比
  const ratioCheck: Record<string, number> = {
    署名占比: ratio(signSize), // 实际放大后的署名字号
    项目名占比: ratio(F.proj),
    三列值占比: ratio(F.colValue),
    当前阶段名占比: ratio(F.nameCur),
    未开始阶段名占比: ratio(F.nameOther),
    状态胶囊占比: ratio(F.status),
    日期占比: ratio(F.dateOther),
    摘要条占比: ratio(F.sum),
  };
  // 目标占比（按 W=576 的手机观感：署名放大后≈12.5%、大标题≈9%、正文≈6.6%、标签≈5.2%）
  const specRatio: Record<string, number> = {
    署名占比: 12.5,
    项目名占比: 9.0,
    三列值占比: 6.9,
    当前阶段名占比: 8.2,
    未开始阶段名占比: 6.6,
    状态胶囊占比: 5.2,
    日期占比: 6.3,
    摘要条占比: 5.9,
  };
  let fail = false;
  for (const k of Object.keys(specRatio)) {
    if (Math.abs(ratioCheck[k] - specRatio[k]) > 2) {
      fail = true;
      console.error(`[排期图] 字号占比不符: ${k}=${ratioCheck[k].toFixed(1)}%(目标 ${specRatio[k]}%)`);
    }
  }
  console.log('[排期图] 自检报告:', JSON.stringify({
    逻辑画布: [W, H],
    物理画布: [canvas.width, canvas.height],
    长宽比: (W / H).toFixed(4),
    字号占比_项目名: `${ratio(F.proj).toFixed(1)}%`,
    字号占比_当前阶段名: `${ratio(F.nameCur).toFixed(1)}%`,
    字号占比_三列值: `${ratio(F.colValue).toFixed(1)}%`,
    字号占比_正文: `${ratio(F.nameOther).toFixed(1)}%`,
    时间线行总高: timelineRows,
    三列等宽: c0.toFixed(1),
    数据: `${stages.length}阶段/${doneCount}完成/${doingCount}进行中/${todoCount}未开始`,
  }));
  assert(!fail, '存在字号与规范偏差 >2px，已拒绝交付');
  assert(canvas.width === W * DPR && canvas.height === H * DPR,
    `画布物理像素 ${canvas.width}x${canvas.height} 必须为 ${W * DPR}x${H * DPR}`);

  return canvas.toDataURL('image/png');
}