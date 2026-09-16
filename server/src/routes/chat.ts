import { Router } from 'express';
import dayjs from 'dayjs';
import { Config, HeaderUtils, LLMClient } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = Router();

const SYSTEM_PROMPT = `你是「计划管家」，一位专业、贴心的个人日程规划助手。
你的职责：
1. 帮助用户把待办事项、想法整理成一天的具体时间安排。
2. 事项划分到四类：深度（需要专注的工作）、轻任务（零散小事）、家庭（家庭琐事）、学习（成长学习）。
3. 回复简洁、直接、可执行：给出明确的时间段与排序建议，避免空泛套话。
4. 若用户列出多项任务，请按优先级和精力状况排出先后顺序，必要时说明理由。
5. 当你已经为用户把待办整理进某一天的计划清单时，请在回复末尾自然说明"已为你安排 N 项任务（日期）"，方便用户确认。
6. 不要使用 Markdown 表格，使用分行的纯文本便于移动端阅读。`;

const TASK_TYPES = ['deep', 'light', 'family', 'study'] as const;
type TaskType = (typeof TASK_TYPES)[number];

function looksLikePlanRequest(text: string): boolean {
  return /安排|计划|明天|后天|今天|上午|下午|晚上|早上|中午|凌晨|任务|提醒|待办|约|星期[一二三四五六日天]|日程|排/.test(
    text,
  );
}

function cleanTimeSlot(slot: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(slot || '');
  if (m) {
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const mm = m[2] ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return '09:00';
}

function cleanDate(d: string): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return dayjs().format('YYYY-MM-DD');
}

/**
 * 调用用户已部署的「计划管家智能体」（OpenAI 兼容 /v1/chat/completions，SSE 流式）。
 * 返回 'ok' 表示已成功输出内容；返回 'failed' 表示不可用/无内容（由上层回退到内置大脑）。
 */
async function tryStreamAgent(
  messages: { role: 'user' | 'assistant'; content: string }[],
  onText: (text: string) => void,
): Promise<'ok' | 'failed'> {
  const token = process.env.COZE_WORKLOAD_API_TOKEN;
  const url =
    process.env.PLAN_AGENT_URL ||
    'https://cnhd38mqpq.coze.site/v1/chat/completions';
  if (!token) return 'failed';
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        session_id: process.env.PLAN_AGENT_SESSION || 'longshuilin-app',
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: 0.7,
      }),
    });
    if (!resp.ok || !resp.body) {
      return 'failed';
    }
    const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamed = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of event.split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string }; message?: { content?: string } }[];
              content?: string;
            };
            let content = parsed?.content || '';
            const choice = parsed?.choices?.[0];
            if (choice) {
              content =
                choice.delta?.content ?? choice.message?.content ?? content;
            }
            if (content) {
              streamed += 1;
              onText(content.toString());
            }
          } catch {
            // ignore malformed event
          }
        }
        idx = buffer.indexOf('\n\n');
      }
    }
    return streamed > 0 ? 'ok' : 'failed';
  } catch (err) {
    console.error('agent stream error:', err);
    return 'failed';
  }
}

/**
 * 服务端文件：server/src/routes/chat.ts
 * 接口：POST /api/v1/chat/plan （SSE 流式）
 * Body：messages: { role: 'user'|'assistant', content: string }[]
 * 事件：
 *   data: {"text":"..."}         - 回复正文流式内容
 *   data: {"type":"tasks_created","count":N,"tasks":[...]}
 *   data: [DONE]
 */
router.post('/plan', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
  res.setHeader('Connection', 'keep-alive');

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const today = dayjs().format('M月D日');
  const todayStr = dayjs().format('YYYY-MM-DD');

  const history = messages
    .filter((m: { role?: string; content?: string }) => m && typeof m.content === 'string')
    .slice(-10)
    .map((m: { role: string; content: string }) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));

  const lastUser =
    [...history].reverse().find((m) => m.role === 'user')?.content ?? '';

  // 内置大脑的消息（带系统提示）
  const genericMsgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n今天是${today}。` },
    ...history,
  ];
  // 用户已部署的「计划管家智能体」只吃历史对话（它自带人设），不含我们的系统提示
  const agentMessages: { role: 'user' | 'assistant'; content: string }[] = history;

  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 1) 优先调用用户已部署的「计划管家智能体」；失败则回退内置大脑
    let assistantReply = '';
    const agentRes = await tryStreamAgent(agentMessages, (text) => {
      assistantReply += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    if (agentRes === 'failed') {
      // 回退：使用内置「计划管家」流式输出
      const stream = client.stream(genericMsgs, {
        model: 'doubao-seed-2-0-pro-260215',
        temperature: 0.7,
      });
      for await (const chunk of stream) {
        if (chunk.content) {
          const text = chunk.content.toString();
          assistantReply += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
    }

    // 2) 若用户是在陈述排期，则抽取为任务并写入「龙水林任务表」
    if (looksLikePlanRequest(lastUser)) {
      try {
        const created = await extractAndInsertTasks(client, lastUser, todayStr);
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

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
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
[{"title":"写季度报告","remark":"整理数据","time_slot":"09:00","task_type":"deep","plan_date":"${todayStr}"}]

规则：
- plan_date：默认为 ${todayStr}；若提到"明天"则用 ${dayjs().add(1, 'day').format('YYYY-MM-DD')}；"后天"用 ${dayjs().add(2, 'day').format('YYYY-MM-DD')}。
- time_slot：根据时间描述推断成 HH:MM（如"上午9点"→09:00，"下午两点"→14:00）；无法判断则用 09:00。
- task_type：深度专注工作=deep；零散小事/杂事/回复消息=light；家庭/买菜/家务/陪家人=family；学习/读书/背单词/上课=study。
- remark：可为空字符串。
- 把原文中的各项待办逐条列出。如果用户只是在闲聊、询问建议，而没有明确要排的待办事项，则返回 []。

用户指令：${userText}`;

  const resp = await client.invoke(
    [{ role: 'user', content: prompt }],
    { model: 'doubao-seed-2-0-lite-260215', temperature: 0.1 },
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
      status: 'todo',
    });
  }

  if (rows.length === 0) return [];

  const db = getSupabaseClient();
  const { data, error } = await db.from('tasks').insert(rows).select('title,plan_date,time_slot,task_type');
  if (error) {
    console.error('insert tasks error:', error);
    return [];
  }
  return (data as Array<{ title: string; plan_date: string; time_slot: string; task_type: string }>) ?? [];
}

export default router;