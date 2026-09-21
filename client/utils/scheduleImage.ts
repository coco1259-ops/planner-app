/**
 * 排期图生成器（Web 端，PWA 下用 HTML canvas 绘制 PNG 供系统分享）。
 *
 * 画布规范（用户给定版本，渲染成 480×907(设计坐标) ×2.25 → 1080×2040 物理像素）：
 *   - 背景 #FAF6EF；字体 "Noto Sans CJK SC","PingFang SC",sans-serif
 *   - 结构：头部品牌条 / 项目信息卡(三列) / 高亮当前阶段 + 其余阶段列表 / 进度统计条 / 底部
 *
 * 配色：
 *   奶油底 #FAF6EF｜主紫 #7C3AED｜浅紫底 #F3E8FB｜深字 #1F1B2E
 *   灰标签 #9089A0｜灰副题 #6B6580｜浅灰 #A8A2B8｜圆描边 #CFC9DC｜灰胶囊底 #ECE6DA｜时间线 #DDD8E8
 *
 * 数据：全部来自 App 真实排期数据（调用方传入 input.*），不用演示文字/日期。
 * 底部 "生成于" 使用 GMT+8 当天，动态注入。
 */
import { todayG8 } from './gmt8';

/** 画布物理宽 1080 = 480(设计) × scale(2.25)。物理高 2040 = 9:17（与批准设计一致）。 */
export const CANVAS_W = 1080;
const SCALE = 2.25; // 设计坐标 480×907 → 物理 1080×2040
const DESIGN_W = 480;
const DESIGN_H = 907;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('[排期图自检失败]', msg);
    throw new Error('[排期图自检失败] ' + msg);
  }
}

// ---------- 工具 ----------
/** "YYYY-MM-DD" → "M月D日"（卡片值用）；无法解析返回 null */
function toCnDate(date?: string | null): string | null {
  if (!date) return null;
  const m = /^\d{4}-(\d{1,2})-(\d{1,2})$/.exec(date);
  if (!m) return null;
  return `${+m[1]}月${+m[2]}日`;
}

/** GMT+8 天数差（date - today） */
function diffDaysFromToday(date: string): number {
  const today = todayG8() || '';
  if (!date || !today) return 0;
  const d1 = new Date(`${date}T00:00:00`).getTime();
  const d2 = new Date(`${today}T00:00:00`).getTime();
  return Math.round((d1 - d2) / 86400000);
}

/** 底部左侧 "生成于 YYYY年M月D日"（GMT+8，注入当天） */
export const buildGeneratedLabel = (): string => {
  const today = todayG8();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(today);
  if (!m) return '生成于今日';
  return `生成于 ${+m[1]}年${+m[2]}月${+m[3]}日`;
};

interface ScheduleImageInput {
  projectName: string;
  scheduleType: string;
  clientName?: string;
  pubDate?: string | null;
  stages: { name: string; date?: string | null; done?: boolean }[];
}

export function renderScheduleImageCanvas(input: ScheduleImageInput): string {
  const stages = input.stages;
  const N = stages.length;
  assert(N > 0, '阶段总数必须>0');

  // ---- 配色 ----
  const cream = '#FAF6EF';
  const purple = '#7C3AED';
  const purpleSoft = '#F3E8FB';
  const textMain = '#1F1B2E';
  const grayLabel = '#9089A0';
  const graySub = '#6B6580';
  const grayLight = '#A8A2B8';
  const circleStroke = '#CFC9DC';
  const grayChip = '#ECE6DA';
  const white = '#FFFFFF';
  const timelineColor = '#DDD8E8';
  const dotStatColor = '#D8C4FA';

  const fontFamily = `"Noto Sans CJK SC","Noto Sans SC","PingFang SC",sans-serif`;
  const font = (weight: number, size: number) => `${weight} ${size}px ${fontFamily}`;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = Math.round(CANVAS_W * (17 / 9)); // 2040（9:17）
  const ctx = canvas.getContext('2d')!;
  if (!ctx) throw new Error('no canvas ctx');
  ctx.scale(SCALE, SCALE); // 之后均以 480×907 设计坐标绘制

  const text = (
    s: string, x: number, y: number, color: string, size: number,
    weight = 500, align: CanvasTextAlign = 'left', spacing = 0,
  ) => {
    ctx.font = font(weight, size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    if (spacing > 0) (ctx as any).letterSpacing = `${spacing}px`;
    else (ctx as any).letterSpacing = '0px';
    ctx.fillText(s, x, y);
    (ctx as any).letterSpacing = '0px';
  };
  const measureRaw = (s: string, size: number, weight = 500) => {
    ctx.font = font(weight, size);
    (ctx as any).letterSpacing = '0px';
    return ctx.measureText(s).width;
  };
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };

  // ================= 数据推导 =================
  const projectName = input.projectName || '未命名项目';
  const scheduleType = input.scheduleType || '商单';
  const clientName = input.clientName || '—';
  const pubDate = input.pubDate || null;

  const firstNotDone = stages.findIndex((s) => !s.done);
  const allDone = firstNotDone < 0;
  const curIdx = allDone ? -1 : firstNotDone;
  const curStage = allDone ? null : stages[curIdx];
  const regulars = stages.filter((_, i) => i !== curIdx); // 高亮行之外的所有阶段

  const doneCount = stages.filter((s) => s.done).length;
  const doingCount = allDone ? 0 : 1; // 三数之和= N
  const todoCount = N - doneCount - doingCount;

  let progressStr: string;
  if (allDone) {
    progressStr = '已完结';
  } else {
    progressStr = `${curStage!.name} · 第${curIdx + 1}/${N}阶段`;
  }

  // ================= 布局（设计坐标）=================
  const LO = 34; // 页左右留白
  const RO = DESIGN_W - LO; // 446

  // ---- 头部 ----
  const logoSize = 28;
  const headTop = 34;
  const l1Top = 36;
  const l2Top = l1Top + 13 * 1.25 + 2; // 54.25
  const headerBottom = l2Top + 11 * 1.4; // ≈69.65

  // ---- 信息卡 ----
  const cardTop = headerBottom + 37.5;
  const cardPadX = 18, cardPadTop = 30, cardPadBot = 29;
  const titleSize = 20;
  const colLabelSize = 12, colValueSize = 15, colValuePurpleSize = 14;
  const titleLineH = titleSize * 1.2; // 24
  const colsMarginTop = 16;
  const colH = colLabelSize * 1.2 + 7 + colValueSize * 1.2; // ≈39.4
  const cardH = cardPadTop + titleLineH + colsMarginTop + colH + cardPadBot;
  const cardBottom = cardTop + cardH;

  const cardCX = LO + cardPadX; // 52
  const cardRX = RO - cardPadX; // 428
  const titleTop = cardTop + cardPadTop;
  const badgeSize = 14, badgePy = 5, badgePx = 6;
  const badgeH = badgeSize + badgePy * 2;
  const badgeW = measureRaw(scheduleType, badgeSize, 700) + badgePx * 2;

  const colsTop = titleTop + titleLineH + colsMarginTop;
  const col1W = 118, col2W = 130;
  const col1X = cardCX, col2X = cardCX + col1W, col3X = cardCX + col1W + col2W;

  // ---- 高亮当前行 + 其余阶段 ----
  const row1Top = cardBottom + 36;
  const row1H = 72;
  const row1Bottom = row1Top + row1H;
  const rowsTop = (curStage ? row1Bottom : cardBottom) + 15;
  const rowStep = 32 + 20; // 52
  const numReg = regulars.length;
  const rowsBottom = numReg > 0 ? rowsTop + (numReg - 1) * rowStep + 32 : rowsTop;

  // ---- 统计条 ----
  const statTop = rowsBottom + 36;
  const statH = 55;
  const statRadius = 18;

  // ---- 底部 ----
  const footSize = 11.5;
  const footTop = statTop + statH + 22;

  // ================= 开始绘制 =================
  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // ---- 头部 ----
  text('起舞龙清影', LO, headTop, textMain, logoSize, 700, 'left');
  text('项目排期表', RO, l1Top, graySub, 13, 500, 'right', 1);
  text('PROJECT SCHEDULE', RO, l2Top, grayLight, 11, 600, 'right', 2);

  // ---- 项目信息卡 ----
  ctx.fillStyle = white;
  ctx.shadowColor = 'rgba(0,0,0,0.04)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  roundRect(LO, cardTop, RO - LO, cardH, 18);
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // 第1行：项目名 + 类型胶囊（右对齐，垂直居中）
  let projStr = projectName;
  const projAvail = (cardRX - badgeW - 16) - cardCX;
  while (measureRaw(projStr, titleSize, 700) > projAvail && projStr.length > 1) projStr = projStr.slice(0, -1);
  if (projStr !== projectName) projStr += '…';
  const projY = titleTop + (titleLineH - titleSize) / 2;
  text(projStr, cardCX, projY, textMain, titleSize, 700, 'left');
  // 右端类型胶囊
  ctx.fillStyle = purpleSoft;
  const badgeTop = titleTop + (titleLineH - badgeH) / 2;
  roundRect(cardRX - badgeW, badgeTop, badgeW, badgeH, badgeH);
  ctx.fill();
  text(scheduleType, cardRX - badgeW / 2, badgeTop + (badgeH - badgeSize) / 2, purple, badgeSize, 700, 'center');

  // 第2行：三列
  const valTop = colsTop + colLabelSize * 1.2 + 7;
  // 1 品牌方
  text('品牌方', col1X, colsTop, grayLabel, colLabelSize, 500);
  text(clientName, col1X, valTop, textMain, colValueSize, 700);
  // 2 发布日期
  const pubTxt = toCnDate(pubDate) ?? '待定';
  text('发布日期', col2X, colsTop, grayLabel, colLabelSize, 500);
  text(pubTxt, col2X, valTop, purple, colValuePurpleSize, 700);
  // 3 当前进度
  text('当前进度', col3X, colsTop, grayLabel, colLabelSize, 500);
  let progressTxt = progressStr;
  const progressAvail = RO - cardPadX - col3X;
  while (measureRaw(progressTxt, colValuePurpleSize, 700) > progressAvail && progressTxt.length > 1) progressTxt = progressTxt.slice(0, -1);
  if (progressTxt !== progressStr) progressTxt += '…';
  text(progressTxt, col3X, valTop, purple, colValuePurpleSize, 700);

  // ---- 阶段列表 ----
  const dotRadius = 43 / 2, ringRadius = 32 / 2;

  // 高亮当前行（浅紫底 + 实心紫圆 + 进行中胶囊）
  if (curStage) {
    ctx.fillStyle = purpleSoft;
    roundRect(LO, row1Top, RO - LO, row1H, 13);
    ctx.fill();
    const ccy = row1Top + row1H / 2;
    // 实心紫圆 + 阴影
    const d0x = LO + 14.3 + ringRadius; // 高亮行的圆与列表圆对齐（左侧）——保持统一圆心
    const solidCX = LO + 14.3 + dotRadius;
    ctx.fillStyle = purple;
    ctx.shadowColor = 'rgba(124,58,237,0.35)';
    ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.arc(solidCX, ccy, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = white;
    ctx.font = font(700, 20);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${curIdx + 1}`, solidCX, ccy);
    // 阶段名（进行中）
    const rnameSize = 17;
    const rnameX = solidCX + dotRadius + 14;
    text(curStage.name, rnameX, ccy - rnameSize / 2, textMain, rnameSize, 700, 'left');
    // 进行中胶囊（白底紫描边）
    const tagTxt = '进行中';
    const tagSize = 14, tagPx = 15, tagPy = 6;
    const tagW = measureRaw(tagTxt, tagSize, 700) + tagPx * 2;
    const tagH = tagSize + tagPy * 2;
    const tagX = rnameX + measureRaw(curStage.name, rnameSize, 700) + 5;
    ctx.strokeStyle = purple;
    ctx.lineWidth = 2;
    ctx.fillStyle = white;
    roundRect(tagX, ccy - tagH / 2, tagW, tagH, tagH);
    ctx.fill();
    ctx.stroke();
    text(tagTxt, tagX + tagW / 2, ccy - tagSize / 2, purple, tagSize, 700, 'center');
    // 日期（右对齐）
    const rdateTxt = toCnDate(curStage.date) ?? '待定';
    text(rdateTxt, RO - 24, ccy - rnameSize / 2, textMain, rnameSize, 700, 'right');
  }

  // 其余阶段（未开始/已完成）
  const ringCX = LO + 19.8 + ringRadius; // 列表行圆心对齐高亮行圆左
  // 竖向时间线：从第一个列表圆心连到最后一个列表圆心
  if (numReg > 0) {
    const firstCy = rowsTop + (0) * rowStep + ringRadius + 16;
    const lastCy = rowsTop + (numReg - 1) * rowStep + ringRadius + 16;
    ctx.strokeStyle = timelineColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ringCX, firstCy);
    ctx.lineTo(ringCX, lastCy);
    ctx.stroke();
  }

  regulars.forEach((st, k) => {
    const cy = rowsTop + k * rowStep + ringRadius + 16;
    const status = st.done ? 'done' : 'todo';
    // 空心圆
    ctx.beginPath();
    ctx.arc(ringCX, cy, ringRadius, 0, Math.PI * 2);
    ctx.fillStyle = cream;
    ctx.fill();
    ctx.strokeStyle = circleStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = grayLabel;
    ctx.font = font(500, 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${stages.indexOf(st) + 1}`, ringCX, cy);
    // 阶段名
    const nnameSize = 14;
    const nnameX = ringCX + ringRadius + 15;
    const tooltip = status === 'done' ? '已完成' : '未开始';
    const labSize = 12, labPx = 8, labPy = 3;
    const labTxt = tooltip;
    const labW = measureRaw(labTxt, labSize, 500) + labPx * 2;
    const labH = labSize + labPy * 2;
    const nameW = measureRaw(st.name, nnameSize, 500);
    // 阶段名（若胶囊空间不足则缩短）
    let nameStr = st.name;
    const nameAvail = (RO - 10) - nnameX - 11 - labW;
    while (measureRaw(nameStr, nnameSize, 500) > nameAvail && nameStr.length > 1) nameStr = nameStr.slice(0, -1);
    if (nameStr !== st.name) nameStr += '…';
    text(nameStr, nnameX, cy - nnameSize / 2, textMain, nnameSize, 500, 'left');
    // 状态胶囊
    const labX = nnameX + measureRaw(nameStr, nnameSize, 500) + 11;
    ctx.fillStyle = grayChip;
    roundRect(labX, cy - labH / 2, labW, labH, labH);
    ctx.fill();
    text(labTxt, labX + labW / 2, cy - labSize / 2, grayLabel, labSize, 500, 'center');
    // 日期（右对齐）
    const tdate = toCnDate(st.date) ?? '待定';
    text(tdate, RO - 10, cy - nnameSize / 2, textMain, nnameSize, 500, 'right');
    void nameW;
  });

  // ---- 进度统计条 ----
  const daysRaw = pubDate ? diffDaysFromToday(pubDate) : null;
  const daysTxt = daysRaw == null ? '待定' : (daysRaw >= 0 ? `${daysRaw} 天` : '已发布');
  const segs = [
    `已完成 ${doneCount}`,
    `进行中 ${doingCount}`,
    `未开始 ${todoCount}`,
    `距发布 ${daysTxt}`,
  ];
  ctx.fillStyle = purple;
  roundRect(LO, statTop, RO - LO, statH, statRadius);
  ctx.fill();
  const statSize = 14;
  const segGap = 20; // 圆点段（直径8 + 两侧6边距）
  const dotDia = 8;
  const widths = segs.map((s) => measureRaw(s, statSize, 700));
  const total = widths.reduce((a, b) => a + b, 0) + segGap * (segs.length - 1);
  const ccy = statTop + statH / 2;
  let x = (DESIGN_W - total) / 2;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  segs.forEach((s, i) => {
    ctx.fillStyle = white;
    ctx.font = font(700, statSize);
    ctx.fillText(s, x, ccy);
    x += widths[i];
    if (i < segs.length - 1) {
      const dotBack = x + 10;
      ctx.fillStyle = dotStatColor;
      ctx.beginPath();
      ctx.arc(dotBack, ccy, dotDia / 2, 0, Math.PI * 2);
      ctx.fill();
      x += segGap;
    }
  });

  // ---- 底部 ----
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  text(buildGeneratedLabel(), LO + 12, footTop, grayLabel, footSize, 500);
  text('当前进度可手动调整', RO - 12, footTop, grayLabel, footSize, 500, 'right');

  // ================= 自检断言 =================
  assert(canvas.width === CANVAS_W, `canvas.width===${canvas.width} 必须为 ${CANVAS_W}`);
  assert(canvas.height === Math.round(CANVAS_W * (17 / 9)), `canvas.height===${canvas.height} 必须为 ${Math.round(CANVAS_W * (17 / 9))}`);
  assert(stages.length === N, '阶段行数必须等于阶段数组长度');
  assert(doneCount + doingCount + todoCount === N, '摘要三数之和必须等于阶段总数');
  assert(N > 0, '阶段总数必须>0');

  console.log('[排期图] 自检报告:', JSON.stringify({
    物理画布: [canvas.width, canvas.height],
    设计坐标: [DESIGN_W, DESIGN_H], 缩放: SCALE,
    阶段数: N,
    '进行中': doingCount, '已完成': doneCount, '未开始': todoCount,
    摘要和: doneCount + doingCount + todoCount,
    项目名: projectName, 类型: scheduleType, 品牌方: clientName,
    当前进度: progressStr, 距发布: daysTxt,
    生成于: buildGeneratedLabel(),
  }));

  return canvas.toDataURL('image/png');
}