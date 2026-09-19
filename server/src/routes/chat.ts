import { Router } from 'express';
import { Config, HeaderUtils, LLMClient } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = Router();

/* ---------- 统一 GMT+8 当前时间工具（生产服务器为 UTC，必须固定 +8，否则日期偏差一天） ---------- */
const G8_MS = 8 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const nowG8 = () => new Date(Date.now() + G8_MS);
/** 今天 "YYYY-MM-DD"（GMT+8 墙钟） */
const todayG8 = () => nowG8().toISOString().slice(0, 10);
/** 今天相对 nowG8 加 n 天 */
const addDaysG8 = (n: number) => {
  const d = nowG8();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** GMT+8 今天的完整注入串：2026年9月19日 星期六（GMT+8） */
const todayInjection = () => {
  const d = nowG8();
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getUTCDay()];
  const mid = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  return `${mid} ${week}（GMT+8）`;
};
/* ------------------------------------------------------------------ */

// 模型名可配置：
// - 本地/沙箱：默认用扣子内置模型（走 coze 集成 base url）；
// - 生产（Railway）：可配置 PLAN_MODEL_NAME / PLAN_EXTRACT_MODEL_NAME 覆盖为豆包接入点(ep-xxxx)等。
const CHAT_MODEL = process.env.PLAN_MODEL_NAME || 'doubao-seed-2-0-pro-260215';
const EXTRACT_MODEL = process.env.PLAN_EXTRACT_MODEL_NAME || 'doubao-seed-2-0-lite-260215';

/**
 * 构建内置大脑的 LLM Client。
 * - 本地/沙箱：coze 运行时会自动注入 COZE_INTEGRATION_MODEL_BASE_URL 等凭据，直接 new Config() 即可；
 * - 线上部署（Railway 等）：coze 不会注入这些 env，需在运行环境显式配置
 *   PLAN_MODEL_BASE_URL（OpenAI 兼容模型端点）与 PLAN_MODEL_API_KEY，
 *   这里用显式 Config 注入，保证模型调用在生产同样可用。
 */
function buildLLMClient(reqHeaders: Record<string, string>): LLMClient {
  const forwardHeaders = HeaderUtils.extractForwardHeaders(reqHeaders);
  const explicitBaseUrl = process.env.PLAN_MODEL_BASE_URL;
  const explicitKey = process.env.PLAN_MODEL_API_KEY;
  if (explicitBaseUrl && explicitKey) {
    return new LLMClient(new Config({ modelBaseUrl: explicitBaseUrl, apiKey: explicitKey }), forwardHeaders);
  }
  // 缺显式配置时回退到 coze 注入 env（本地/沙箱）
  return new LLMClient(new Config(), forwardHeaders);
}

const SYSTEM_PROMPT = `# 角色
你是龙水林的日程计划管家。龙水林：独自带娃的宝爸，母婴自媒体创作者（一人+3个AI员工的虚拟团队）。他的时间极度稀缺，你存在的唯一价值：保护他的整块时间不被侵蚀。

# 龙水林的固定作息（铁律，任何计划不得占用这些时段）
4:00 起床工作 → 7:00 伺候孩子起床洗漱早餐 → 8:00–10:00 户外 → 10:00–11:00 做午饭吃饭 → 11:00–12:30 陪娃+碎片工作 → 12:30–13:30 午睡 → 13:30–14:30 工作 → 14:30–15:00 加餐 → 15:00–17:00 户外 → 17:00–18:00 做晚饭 → 18:00–18:30 晚饭 → 18:30–21:00 备餐/洗澡/护理/启蒙绘本/排明日计划 → 21:00 关灯睡觉

# 可用工作时段（只在这些时段里排）
- 深度整块：4:00–7:00（3小时）、13:30–14:30（1小时）
- 碎片：11:00–12:30（半陪半工作）、户外偶发零碎
- 出行日（每周约2天，不定哪天）：默认只保留4:00–7:00

# 工作流一：任务排程
1. 收到排计划请求，先反问三件（没答完不排）：
   ① 明天常规日还是出行日？
   ② 明天的核心事项有哪些？（口述即可，想到啥说啥）
   ③ 有没有硬截止？（定时发布/合作交付）
2. 排程（一步步来）：
   - 4:00–7:00 只给深度工作：写脚本/终审/剪辑单/周计划，按30分钟一格
   - 碎片时间给轻任务：回评论/审核AI产出/浏览素材
   - 禁止"尽量、争取"——只有"几点，做什么"
   - 单日总量不超过4.5小时，留缓冲
3. 输出格式（一行一任务）：时间段 | 事项 | 类型 | 备注

# 工作流二：内容排期创建
1. 用户提到"商单/接单/排期/选题定了/发布日期"等意图时，进入排期创建流程
2. 必须反问（没答完不建）：
   ① 项目名称？② 商单还是科普选题？③ 发布日期？
   （商单再问客户名，科普选题跳过）
3. 信息齐后写入 schedule 表，只填已确认的字段，
   用户没提的阶段日期留空，完成状态默认"未完成"
4. 写入成功后回复："排期已建，各阶段日期去排期Tab补上"

# 约束
- 铁律时段出现在计划里 = 排错了，重来
- 事项超过8条，主动提示精简
- 计划末尾给1句风险提示：哪项最可能被孩子打断、被打断后挪到哪个空隙

# 写表规则一：任务 → tasks 表
排程确认后写入 tasks 表：
- 日期（plan_date，"明天"换算成具体日期 YYYY-MM-DD）
- 时间段（time_slot，标准时段格式 09:00 或 4:00-7:00，也可写"随时"/"碎片"/"上午"等自由文本）、事项（title）、备注（remark）
- 类型（task_type，只能选：deep=深度/light=轻度/personal=个人/study=学习/goal=目标/life=生活）
- 状态默认"未做"（todo）
- 时间段的写法规则：碎片或不定时的任务，时间段写"随时"或"碎片"；深度任务写具体时段（如 4:00-7:00）
写完回复："已写入 N 条任务到任务表"

# 写表规则二：排期 → schedule 表
排期信息确认后写入 schedule 表，只填已确认字段（project_name/schedule_type/client_name/pub_date），
未提的阶段日期留空，所有完成状态默认未完成。
写入成功回复："排期已建，各阶段日期去排期Tab补上"

# 通用
- 不要使用 Markdown 表格，使用分行的纯文本便于移动端阅读
- 今天是{date}

# 日期与时区换算（铁律）
- 当前真实日期由系统注入（上方"今天"）：格式为 X年X月X日 星期X（GMT+8）。
- 所有"今天/明天/后天/下周/归属周"的换算必须严格基于这条注入的当前日期和 GMT+8 时区计算，严禁自行推测日期。
- 明天 = 注入日期 +1 天；后天 = +2 天；一周从周一开始；"下周"指当前周(周一到周日)之后的下一周。
- 任何写库的日期字段必须为 "YYYY-MM-DD" 具体日期字符串，禁止写"明天""下周"等相对词。`;

const TASK_TYPES = ['deep', 'light', 'personal', 'study', 'goal', 'life'] as const;
type TaskType = (typeof TASK_TYPES)[number];

function looksLikePlanRequest(text: string): boolean {
  return /安排|计划|明天|后天|今天|上午|下午|晚上|早上|中午|凌晨|任务|提醒|待办|约|星期[一二三四五六日天]|日程|排/.test(
    text,
  );
}

function cleanTimeSlot(slot: string): string {
  const s = (slot || '').trim();
  // 完整标准时段：HH:MM 或 HH:MM-HH:MM，直接保留
  if (/^\d{1,2}:\d{2}(-\d{1,2}:\d{2})?$/.test(s)) {
    return s.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, mm) => {
      const hh = String(Math.min(23, Math.max(0, parseInt(h, 10)))).padStart(2, '0');
      return `${hh}:${mm}`;
    });
  }
  // 纯时间点（如 "9点"、"上午9点"）才归一化成 HH:MM
  const m = /(\d{1,2}):(\d{2})/.exec(s);
  if (s && /^\d{1,2}:\d{2}$/.test(s)) {
    const h = Math.min(23, Math.max(0, parseInt(m?.[1] ?? '0', 10)));
    const mm = m?.[2] ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  // 其余为自由文本（随时/碎片/上午/娃午睡时等），原样保留
  return s || '09:00';
}

function cleanDate(d: string): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return todayG8();
}

/**
 * 服务端文件：server/src/routes/chat.ts
 * 接口：POST /api/v1/chat/plan （SSE 流式）
 * Body：messages: { role: 'user'|'assistant', content: string }[]
 * 事件：
 *   data: {"text":"..."}         - 回复正文流式内容
 *   data: {"type":"tasks_created","count":N,"tasks":[...]}
 *   data: {"type":"schedule_created","message":"..."}
 *   data: {"type":"overload_warning","date":"...","totalMinutes":N,"availableMinutes":N}
 *   data: [DONE]
 */
router.post('/plan', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
  res.setHeader('Connection', 'keep-alive');

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const today = todayInjection(); // "2026年9月19日 星期六（GMT+8）"
  const todayStr = todayG8(); // "2026-09-19"

  const history = messages
    .filter((m: { role?: string; content?: string }) => m && typeof m.content === 'string')
    .slice(-10)
    .map((m: { role: string; content: string }) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));

  const lastUser =
    [...history].reverse().find((m) => m.role === 'user')?.content ?? '';

  // 内置大脑的消息（带系统提示），今天是今天日期
  const genericMsgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT.replace('{date}', today) },
    ...history,
  ];

  try {
    const client = buildLLMClient(req.headers as Record<string, string>);

    // 用内置「计划管家」流式输出（不再依赖外部 agent）
    let assistantReply = '';
    const stream = client.stream(genericMsgs, {
      model: CHAT_MODEL,
      temperature: 0.7,
    });
    for await (const chunk of stream) {
      if (chunk.content) {
        const text = chunk.content.toString();
        assistantReply += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // 2) 排期创建流程（写 schedule 表）优先于任务抽取判断
    let scheduleResult: 'created' | 'need_more_info' | 'none' = 'none';
    try {
      scheduleResult = await maybeCreateSchedule(client, lastUser);
      if (scheduleResult === 'created') {
        res.write(
          `data: ${JSON.stringify({ type: 'schedule_created', message: '排期已建，各阶段日期去排期Tab补上' })}\n\n`,
        );
      } else if (scheduleResult === 'need_more_info') {
        // 信息不全：由 AI 对话继续反问，这里不发写表事件
      }
    } catch (e) {
      // 失败不影响主流程
      console.error('create schedule error:', e);
    }

    // 3) 若未走排期且用户在陈述排任务，则抽取为任务并写入 tasks 表
    let created: Array<{ plan_date: string }> = [];
    if (scheduleResult !== 'created' && looksLikePlanRequest(lastUser)) {
      try {
        created = await extractAndInsertTasks(client, lastUser, todayStr);
        if (created.length > 0) {
          res.write(
            `data: ${JSON.stringify({ type: 'tasks_created', count: created.length, tasks: created })}\n\n`,
          );
        }
      } catch (err) {
        // 抽取失败不影响对话主流程
        console.error('extract tasks error:', err);
      }
    }

    // 4) 若某日所有任务预计时长合计超过可用工作时间，主动告警
    if (created.length > 0) {
      await emitOverloadWarnings(res, created.map((t) => t.plan_date));
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    console.error('chat/plan error:', e instanceof Error ? e.stack || e.message : e);
    if (!res.headersSent) {
      res.status(500).json({ error: '计划管家暂时不可用' });
    } else {
      res.write(`data: ${JSON.stringify({ error: '生成中断' })}\n\n`);
      res.end();
    }
  }
});

async function extractAndInsertTasks(
  client: LLMClient,
  userText: string,
  todayStr: string,
): Promise<Array<{ title: string; plan_date: string; time_slot: string; task_type: string }>> {
  const prompt = `根据用户的日程安排指令，抽取出需要创建的任务。只输出一个 JSON 数组，不要输出任何其他文字、代码块标记或解释。
每个元素格式（示例）：
[{"title":"写季度报告","remark":"整理数据","time_slot":"09:00","estimated_duration":"1小时","task_type":"deep","plan_date":"${todayStr}"}]

规则：
- plan_date：默认为 ${todayStr}（这是今天的真实日期，由系统注入，必为 GMT+8 日期）；若提到"明天"则用 ${addDaysG8(1)}；"后天"用 ${addDaysG8(2)}。计算时只能基于这段话里给出的今天日期 ${todayStr} 加减，禁止另行推测。
- time_slot：根据时间描述推断时间段。标准时段用 HH:MM 或 HH:MM-HH:MM（如"上午9点"→09:00，"下午两点"→14:00，"4点到7点"→4:00-7:00）；碎片或不定时的任务写"随时"或"碎片"；无法判断的可用"上午"/"下午"/"随时"等自由文本。
- estimated_duration：根据指令推断预计时长，用中文描述（如"30分钟""1小时""1小时30分钟"）；无法判断则用空字符串。
- task_type：深度专注工作/写脚本/剪辑=deep；零散小事/回评论/审核AI产出/浏览素材=light；个人事务/陪娃外私事=personal；学习/读书/背单词/上课=study；目标=goal；生活起居/陪娃/家务/吃饭睡觉=life。
- remark：可为空字符串。
- 把原文中的各项待办逐条列出。如果用户只是在闲聊、询问建议，而没有明确要排的待办事项，则返回 []。

用户指令：${userText}`;

  const resp = await client.invoke(
    [{ role: 'user', content: prompt }],
    { model: EXTRACT_MODEL, temperature: 0.1 },
  );

  const raw = resp.content ?? '';
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  let list: unknown;
  try {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    list = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) return [];

  const rows: Array<{
    title: string;
    remark: string;
    task_type: TaskType;
    plan_date: string;
    time_slot: string;
    estimated_duration: string;
    status: 'todo';
  }> = [];

  for (const item of list as Array<Record<string, unknown>>) {
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    if (!title) continue;
    let ttype = typeof item.task_type === 'string' ? item.task_type : 'light';
    if (!TASK_TYPES.includes(ttype as TaskType)) ttype = 'light';
    rows.push({
      title: title.slice(0, 255),
      remark: typeof item.remark === 'string' ? item.remark.slice(0, 500) : '',
      task_type: ttype as TaskType,
      plan_date: cleanDate(item.plan_date as string),
      time_slot: cleanTimeSlot(item.time_slot as string),
      estimated_duration:
        typeof item.estimated_duration === 'string' ? item.estimated_duration.slice(0, 40) : '',
      status: 'todo',
    });
  }

  if (rows.length === 0) return [];

  const db = getSupabaseClient();
  const { data, error } = await db
    .from('tasks')
    .insert(rows)
    .select('title,plan_date,time_slot,estimated_duration,task_type');
  if (error) {
    console.error('insert tasks error:', error);
    return [];
  }
  return (data as Array<{ title: string; plan_date: string; time_slot: string; estimated_duration: string; task_type: string }>) ?? [];
}

/** 将"预计时长"文本解析为分钟数，便于累加告警。无法解析返回 0。 */
function parseDurationMinutes(text: string): number {
  if (!text) return 0;
  const s = String(text).trim();
  let minutes = 0;
  const h = /(\d+(?:\.\d+)?)\s*(小时|时|h|hour|hr)/i.exec(s);
  const m = /(\d+)\s*(分钟|分|min|m\b)/i.exec(s);
  if (h) minutes += parseFloat(h[1]) * 60;
  if (m) minutes += parseInt(m[1], 10);
  return Math.round(minutes);
}

const AVAILABLE_WORK_MINUTES = (() => {
  const n = Number(process.env.OVERLOAD_WORK_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 480; // 默认 8 小时
})();

/** 对受影响日期，计算当日全部预计时长合计，超过可用工作时间则写入告警事件 */
async function emitOverloadWarnings(
  res: import('express').Response,
  affectedDates: string[],
): Promise<void> {
  const dates = [...new Set(affectedDates)].filter(Boolean);
  if (dates.length === 0) return;
  const db = getSupabaseClient();
  for (const d of dates) {
    try {
      const { data } = await db.from('tasks').select('estimated_duration').eq('plan_date', d);
      const total = (data ?? []).reduce((sum, r) => sum + parseDurationMinutes(r.estimated_duration || ''), 0);
      if (total > AVAILABLE_WORK_MINUTES) {
        res.write(
          `data: ${JSON.stringify({
            type: 'overload_warning',
            date: d,
            totalMinutes: total,
            availableMinutes: AVAILABLE_WORK_MINUTES,
          })}\n\n`,
        );
      }
    } catch {
      // 个别日期统计失败不影响主流程
    }
  }
}

/** 将"stages 中文键名 → {date, done}"对象按 8 阶段规范化（缺失的补空、done 默认 false）。 */
const SCHEDULE_STAGE_KEYS = ['大纲', '粗稿', '定稿', '拍摄', '粗剪', '送审', '精剪', '发布'] as const;

function normalizeStages(raw: unknown): Record<string, { date: string | null; done: boolean }> {
  const out: Record<string, { date: string | null; done: boolean }> = {};
  for (const key of SCHEDULE_STAGE_KEYS) {
    const item = (raw && typeof raw === 'object' ? raw as Record<string, any> : {})[key];
    let date: string | null = null;
    let done = false;
    if (item && typeof item === 'object') {
      if (typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) date = item.date;
      if (item.done === true) done = true;
    }
    out[key] = { date, done };
  }
  return out;
}

/**
 * 判断用户是否在发起"内容排期创建"，若信息齐全则写入 schedule 表。
 * 返回 'created' 表示已写入；'need_more_info' 表示命中了排期意图但信息不全（不写表）；'none' 表示非排期请求。
 */
async function maybeCreateSchedule(client: LLMClient, userText: string): Promise<'created' | 'need_more_info' | 'none'> {
  const intent = /排期|商单|接单|选题定了|选题|发布日期|发布时间|上刊|合作交付|客户/.test(userText || '');
  if (!intent) return 'none';

  const prompt = `判断用户是否在要求"创建一条内容排期"（项目/选题/商单构思并定档）。
只输出一个 JSON 对象，不要输出任何其他文字。若信息不满足则返回 {"status":false}。

需要项目名称、类型（商单/科普选题）、发布日期。类型常见表述：
- 商单：提到客户/品牌/合作/接单/商单
- 科普选题：明确说是选题/科普
若是商单还需客户名。

输出格式：
{"status":true,"project_name":"...","schedule_type":"商单|科普选题","client_name":"...或空","pub_date":"YYYY-MM-DD"}

规则：
- pub_date 仅当用户明确给出发布日期；否则可根据今天(${todayG8()}，今天真实日期)及"下周/周五/月底"推算出合理日期；推算时只能基于 ${todayG8()} 在 GMT+8 时区加减，禁止另行推测；仍无法确定返回空字符串。
- 只填用户明确确认的信息，缺少关键字段也填，交由上层判断。
- 用户只是在闲聊或询问建议而非确定要建排期，返回 {"status":false}。

用户指令：${userText}`;

  let resp;
  try {
    resp = await client.invoke(
      [{ role: 'user', content: prompt }],
      { model: EXTRACT_MODEL, temperature: 0.1 },
    );
  } catch (e) {
    console.error('schedule intent invoke error:', e);
    return 'none';
  }

  let obj: Record<string, unknown> | null = null;
  try {
    const raw = (resp?.content ?? '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    obj = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  } catch {
    obj = null;
  }

  if (!obj || obj.status !== true) return 'none';

  const projectName = typeof obj.project_name === 'string' ? obj.project_name.trim() : '';
  const scheduleType = obj.schedule_type === '科普选题' ? '科普选题' : '商单';
  const clientName = typeof obj.client_name === 'string' ? obj.client_name.trim() : '';
  let pubDate = typeof obj.pub_date === 'string' ? obj.pub_date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pubDate)) pubDate = '';
  // 发布日期至少不能早于今天（宽松处理：排期通常是未来）
  // "必填：项目名称 + 类型 + 发布日期" 三项齐全才写入
  if (!projectName || !pubDate) {
    // 缺关键字段：信息不全，返回 need_more_info，交由对话反问
    return 'need_more_info';
  }

  const stages = normalizeStages({});
  const db = getSupabaseClient();
  const { error } = await db.from('schedule').insert({
    project_name: projectName,
    schedule_type: scheduleType,
    client_name: scheduleType === '商单' ? clientName : '',
    pub_date: pubDate,
    stages,
  });
  if (error) {
    console.error('insert schedule error:', error);
    return 'none';
  }
  return 'created';
}

export default router;