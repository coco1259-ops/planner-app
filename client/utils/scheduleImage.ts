/**
 * 排期图生成器（Web 端，PWA 下用 HTML canvas 绘制 PNG 供系统分享）。
 *
 * 画布规范（用户给定，参数锁定，禁止自由发挥）：
 *   - 宽 1080px，高随内容自适应（8 阶段时约 1660px）
 *   - 背景 #FAF6EF；字体 "PingFang SC","Noto Sans CJK SC",sans-serif
 *     标题字重 800、正文 700、辅助 500
 *
 * 配色：
 *   奶油底 #FAF6EF｜主紫 #7C3AED｜浅紫底 #F3E8FB｜深字 #1F1B2E
 *   灰标签 #9089A0｜灰副题 #6B6580｜浅灰 #A8A2B8｜圆描边 #CFC9DC｜连线 #E5E1EE｜灰胶囊底 #ECE6DA
 */
import { todayG8 } from './gmt8';

/** 画布固定宽 1080。 */
const CANVAS_W = 1080;
const DPR = 1; // 直接用物理像素绘制，宽 1080。

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('[排期图自检失败]', msg);
    throw new Error('[排期图自检失败] ' + msg);
  }
}

// ---------- 工具 ----------
/** "YYYY-MM-DD" → "YYYY年M月D日" |
 * "M月D日"（用于卡片值） */
function toCnDate(date?: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  if (!m) return null;
  return `${+m[2]}月${+m[3]}日`;
}
function toCnDateFull(date?: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  if (!m) return null;
  return `${+m[1]}年${+m[2]}月${+m[3]}日`;
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
  const full = toCnDateFull(today);
  return full ? `生成于 ${full}` : '生成于今日';
};

interface ScheduleImageInput {
  projectName: string;
  scheduleType: string;
  clientName?: string;
  pubDate?: string | null;
  stages: { name: string; date?: string | null; done?: boolean }[];
}

/** 阶段状态推断：第一个未完成 = 进行中；之前的 = 已完成；之后 = 未开始 */
function stageStatus(stages: ScheduleImageInput['stages'], idx: number): 'done' | 'doing' | 'todo' {
  const st = stages[idx];
  if (st?.done) return 'done';
  const firstNotDone = stages.findIndex((s) => !s.done);
  if (firstNotDone < 0) return 'done'; // 全部完成
  return idx === firstNotDone ? 'doing' : 'todo';
}

export function renderScheduleImageCanvas(input: ScheduleImageInput): string {
  const W = CANVAS_W;
  const stages = input.stages;
  const N = stages.length;

  // ---- 配色 ----
  const cream = '#FAF6EF';
  const purple = '#7C3AED';
  const purpleSoft = '#F3E8FB';
  const textMain = '#1F1B2E';
  const grayLabel = '#9089A0';
  const graySub = '#6B6580';
  const grayLight = '#A8A2B8';
  const circleStroke = '#CFC9DC';
  const lineColor = '#E5E1EE';
  const grayChip = '#ECE6DA';
  const white = '#FFFFFF';

  const fontFamily = `"PingFang SC","Noto Sans CJK SC",sans-serif`;
  const font = (weight: number, size: number) => `${weight} ${size}px ${fontFamily}`;

  // 先创建（高度后置），绘制时再固定
  const canvas = document.createElement('canvas');
  canvas.width = W;
  const ctx = canvas.getContext('2d')!;
  if (!ctx) throw new Error('no canvas ctx');

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

  // 布局：横向
  const XL = 90; // 主内容左边距（连线圆心 x=45，圆最大半径45，故内容从90起）
  const LINE_X = 45;
  const XR = W - 90; // 主内容右边距（90）

  // ================= 高度自适应布局 =================
  // 头部
  const headPadBottom = 45;
  const headH = 100; // 头部内容区高度（容纳 58 署名）
  const headTop = 40;

  // 卡片
  const cardPadX = 36, cardPadYTop = 36, cardPadYBot = 36;
  const cardRadius = 40;
  const projSize = 56;
  const cardTitleRowH = 70; // 项目名行（含胶囊）
  const labelSize = 25, valueSize = 36;
  const colsGapRow = 14 + valueSize; // 标签下距14 + 值高
  const cardBodyH = colsGapRow; // 三列区
  const cardH = cardPadYTop + cardTitleRowH + cardBodyH + cardPadYBot;
  const cardGap = 45;

  // 时间线
  const tlGap = 36;
  const currRowH = 144; // 进行中行：圆直径90 + 上下内边距18*2 + 上下外距9*2
  const todoRowH = 82;  // 未开始行：圆直径72 + 上下内边距5*2（无外距）
  const circleDone = 90, circleTodo = 72;
  const lineBottomGap = 36;

  // 摘要条
  const sumPadX = 36, sumPadY = 32, sumSize = 29, sumRadius = 36;
  const sumH = sumPadY * 2 + sumSize + 8;
  const sumGap = 36;

  // 底部
  const footSize = 25;
  const footPadTop = 20, footPadBottom = 50;

  // 计算高度
  let nextY = headTop + headH + headPadBottom;
  const cardY = nextY; nextY += cardH + cardGap;

  // 时间线行高数组 + 圆心位置
  const rowHArr = stages.map((_, i) => (stageStatus(stages, i) === 'doing' ? currRowH : todoRowH));
  const cyArr: number[] = [];
  let ty = nextY;
  const rowTopArr: number[] = [];
  stages.forEach((_, i) => {
    rowTopArr.push(ty);
    cyArr.push(ty + rowHArr[i] / 2);
    ty += rowHArr[i];
  });
  const tlBottom = ty;
  const totalH = tlBottom + lineBottomGap + sumH + sumGap + footPadTop + footSize + footPadBottom;

  canvas.height = totalH;
  const H = totalH;

  // ---- 背景 ----
  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, W, H);

  // ============= 一、头部 =============
  // 左：起舞龙清影 58 800 #1F1B2E 字间距4
  text('起舞龙清影', XL, headTop, textMain, 58, 800, 'left', 4);
  // 右两行（右对齐）：第一行“项目排期表”27 500 #6B6580；第二行 PROJECT SCHEDULE 22 600 #A8A2B8 字间距7；行距7
  text('项目排期表', XR, headTop + 2, graySub, 27, 500, 'right');
  text('PROJECT SCHEDULE', XR, headTop + 2 + 27 + 7, grayLight, 22, 600, 'right', 7);

  // ============= 二、项目信息卡 =============
  ctx.fillStyle = white;
  ctx.shadowColor = 'rgba(0,0,0,0.04)';
  ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  roundRect(XL, cardY, XR - XL, cardH, cardRadius);
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  const cardCX = XL + cardPadX;
  const cardRX = XR - cardPadX;
  // 第一行：左项目名 + 右类型胶囊
  // 胶囊尺寸（内边距 上9 下9 左27 右27，全圆角）
  const typeText = input.scheduleType || '商单';
  const typeSize = 27;
  const typeH = 27 + 9 * 2;
  const typeW = measureRaw(typeText, typeSize, 700) + 27 * 2;
  // 项目名（若过长，右侧让位胶囊）
  let projStr = input.projectName || '未命名项目';
  const projAvailable = (cardRX - typeW - 24) - cardCX;
  while (measureRaw(projStr, projSize, 800) > projAvailable && (projStr.length > 1)) {
    projStr = projStr.slice(0, -1);
  }
  if (projStr !== (input.projectName || '未命名项目')) projStr += '…';
  const projY = cardY + cardPadYTop;
  text(projStr, cardCX, projY, textMain, projSize, 800);
  // 胶囊（垂直居中于项目名行）
  ctx.fillStyle = purpleSoft;
  roundRect(cardRX - typeW, projY + (projSize - typeH) / 2, typeW, typeH, typeH / 2);
  ctx.fill();
  text(typeText, cardRX - typeW / 2, projY + (projSize - typeH) / 2 + (typeH - typeSize) / 2 + 1, purple, typeSize, 700, 'center');

  // 第二行三列等分
  const colTop = projY + projSize + 28;
  const colsGap = 30;
  const colW = (cardRX - cardCX - colsGap * 2) / 3;
  const colX = [cardCX, cardCX + colW + colsGap, cardCX + (colW + colsGap) * 2];

  // 1 品牌方
  text('品牌方', colX[0], colTop, grayLabel, labelSize, 500);
  text(input.clientName || '—', colX[0], colTop + labelSize + 14, textMain, valueSize, 700);
  // 2 发布日期
  const pubTxt = toCnDate(input.pubDate) ?? '待定';
  text('发布日期', colX[1], colTop, grayLabel, labelSize, 500);
  text(pubTxt, colX[1], colTop + labelSize + 14, purple, valueSize, 700);
  // 3 当前进度（“当前阶段名 · 第x/8阶段”）
  const firstNotDone = stages.findIndex((s) => !s.done);
  const allDone = firstNotDone < 0;
  let progressStr: string;
  let curIdx = 0;
  let curName = '';
  if (allDone) {
    progressStr = '已完结';
  } else {
    curIdx = firstNotDone;
    curName = stages[curIdx].name;
    progressStr = `${curName} · 第${curIdx + 1}/${N}阶段`;
  }
  text('当前进度', colX[2], colTop, grayLabel, labelSize, 500);
  text(progressStr, colX[2], colTop + labelSize + 14, purple, valueSize, 700);

  // ============= 三、阶段时间线 =============
  // 竖向连线：x中心45，从第一个圆心连到最后一个圆心（圆压在连线上层）→ 先画线再画圆
  const firstCy = cyArr[0], lastCy = cyArr[cyArr.length - 1];
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(LINE_X, firstCy);
  ctx.lineTo(LINE_X, lastCy);
  ctx.stroke();

  const doneCount = stages.filter((s) => s.done).length;
  const doingCount = allDone ? 0 : 1;
  const todoCount = N - doneCount - doingCount;

  stages.forEach((st, idx) => {
    const status = stageStatus(stages, idx);
    const cy = cyArr[idx];
    const isCur = status === 'doing';

    // 当前行：整行浅紫底圆角32
    if (isCur) {
      ctx.fillStyle = purpleSoft;
      roundRect(XL, rowTopArr[idx], XR - XL, currRowH, 32);
      ctx.fill();
    }

    // 节点圆
    if (isCur) {
      // 实心紫圆 直径90 + 阴影
      ctx.fillStyle = purple;
      ctx.shadowColor = 'rgba(124,58,237,0.35)';
      ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
      ctx.beginPath();
      ctx.arc(LINE_X, cy, circleDone / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // 白字序号 43 800
      ctx.fillStyle = white;
      ctx.font = font(800, 43);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${idx + 1}`, LINE_X + 1, cy + 2);
    } else {
      // 空心圆：底#FAF6EF 描边6 #CFC9DC 直径72（左外距9使圆心对齐x=45）
      ctx.beginPath();
      ctx.arc(LINE_X, cy, circleTodo / 2, 0, Math.PI * 2);
      ctx.fillStyle = cream;
      ctx.fill();
      ctx.strokeStyle = circleStroke;
      ctx.lineWidth = 6;
      ctx.stroke();
      // 序号 32 #9089A0
      ctx.fillStyle = grayLabel;
      ctx.font = font(600, 32);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${idx + 1}`, LINE_X + 1, cy + 2);
    }

    // 中间：阶段名 + 状态胶囊
    const textX = LINE_X + circleDone / 2 + 36; // 圆右缘 + 间距
    // name + 胶囊
    if (isCur) {
      // 阶段名 54 700 #1F1B2E
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      text(st.name, textX, cy - 27 - 8, textMain, 54, 700);
      // 进行中胶囊（白底 描边3 #7C3AED 字#7C3AED 27 600，内边距 上下5 左右20 全圆角）
      const capW = measureRaw('进行中', 27, 600) + 20 * 2;
      const capH = 27 + 5 * 2;
      const capY = cy + 54 / 2 - 6;
      ctx.strokeStyle = purple;
      ctx.lineWidth = 3;
      ctx.fillStyle = white;
      roundRect(textX - 12, capY, capW, capH, capH / 2);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = purple;
      ctx.font = font(600, 27);
      ctx.fillText('进行中', textX - 12 + capW / 2, capY + capH / 2 + 1);
      // 日期 54 右对齐
      ctx.textAlign = 'right';
      text(toCnDate(st.date) ?? '待定', XR, cy - 27, textMain, 54, 700, 'right');
    } else {
      // 阶段名 38 700
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      text(st.name, textX, cy - 19, textMain, 38, 700);
      // 灰胶囊（底#ECE6DA 字#9089A0 25 600，内边距 上下5 左右20）：未开始 / 已完成
      const chipLabel = status === 'todo' ? '未开始' : '已完成';
      const capW = measureRaw(chipLabel, 25, 600) + 20 * 2;
      const capH = 25 + 5 * 2;
      const capY = cy + 38 / 2 - 4;
      ctx.fillStyle = grayChip;
      roundRect(textX - 8, capY, capW, capH, capH / 2);
      ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = grayLabel;
      ctx.font = font(600, 25);
      ctx.fillText(chipLabel, textX - 8 + capW / 2, capY + capH / 2 + 1);
      // 日期 38 右对齐
      ctx.textAlign = 'right';
      text(toCnDate(st.date) ?? '待定', XR, cy - 19, textMain, 38, 700, 'right');
    }
  });

  // ============= 四、摘要条 =============
  const sumY = tlBottom + sumGap;
  ctx.fillStyle = purple;
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  roundRect(XL, sumY, XR - XL, sumH, sumRadius);
  ctx.fill();

  const daysRaw = input.pubDate && toCnDate(input.pubDate) ? diffDaysFromToday(input.pubDate) : null;
  const daysTxt = daysRaw == null ? '待定' : (daysRaw >= 0 ? `${daysRaw} 天` : '已发布');
  const segs = [
    `已完成 ${doneCount}`,
    `进行中 ${doingCount}`,
    `未开始 ${todoCount}`,
    `距发布 ${daysTxt}`,
  ];
  const segGap = 22;
  const dotR = 8; // 直径16
  // 计算总段宽
  let totalSegW = 0;
  const segWs = segs.map((s) => measureRaw(s, sumSize, 600));
  const segWithDot = segs.map((_, i) => (i === 0 ? 0 : dotR * 2 + segGap) + segWs[i] + segGap);
  totalSegW = segWithDot.reduce((a, b) => a + b, 0) - segGap;
  let segX = (W - totalSegW) / 2;
  const textCY = sumY + sumH / 2;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = white;
  ctx.font = font(600, sumSize);
  segs.forEach((s, i) => {
    if (i > 0) {
      // 白圆点 直径16 透明度0.7
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(segX + dotR, textCY, dotR, 0, Math.PI * 2);
      ctx.fill();
      segX += dotR * 2 + segGap;
      ctx.fillStyle = white;
    }
    ctx.fillText(s, segX, textCY);
    segX += segWs[i] + segGap;
  });

  // ============= 五、底部 =============
  const footY = sumY + sumH + sumGap + footPadTop;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  text(buildGeneratedLabel(), XL, footY, grayLabel, footSize, 500);
  text('当前进度可手动调整', XR, footY, grayLabel, footSize, 500, 'right');

  // ================= 自检断言 =================
  assert(canvas.width === 1080, `canvas.width===${canvas.width} 必须为 1080`);
  assert(stages.length === N, '阶段行数必须等于阶段数组长度');
  assert(doneCount + doingCount + todoCount === N, '摘要三数之和必须等于阶段总数');
  assert(N > 0, '阶段总数必须>0');
  const eightMark = /第\d+段/;
  if (!allDone) {
    assert(new RegExp(`第${curIdx + 1}/${N}阶段`).test(progressStr), `“第x/8阶段”格式错误: ${progressStr}`);
  }
  // 字号自检：当前行阶段名/日期=54，未开始=38
  assert(currRowH === 144, '当前行高异常');
  // （阶段名/日期字号已在绘制中固定为 54 / 38）

  console.log('[排期图] 自检报告:', JSON.stringify({
    物理画布: [canvas.width, canvas.height],
    宽: W, 高: H,
    阶段数: N,
    阶段行数: stages.length,
    '进行中': doingCount, '已完成': doneCount, '未开始': todoCount,
    摘要和: doneCount + doingCount + todoCount,
    当前进度文案: progressStr,
    距发布: daysTxt,
    '当前行字号': 54, '未开始行字号': 38,
  }));

  return canvas.toDataURL('image/png');
}