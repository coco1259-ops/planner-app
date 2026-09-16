import { Router } from 'express';
import dayjs from 'dayjs';
import { Config, HeaderUtils, LLMClient } from 'coze-coding-dev-sdk';

const router = Router();

const SYSTEM_PROMPT = `你是「计划管家」，一位专业、贴心的个人日程规划助手。
你的职责：
1. 帮助用户把待办事项、想法整理成一天的具体时间安排。
2. 事项划分到四类：深度（需要专注的工作）、轻任务（零散小事）、家庭（家庭琐事）、学习（成长学习）。
3. 回复简洁、直接、可执行：给出明确的时间段与排序建议，避免空泛套话。
4. 若用户列出多项任务，请按优先级和精力状况排出先后顺序，必要时说明理由。
5. 不要使用 Markdown 表格，使用分行的纯文本便于移动端阅读。`;

/**
 * 服务端文件：server/src/routes/chat.ts
 * 接口：POST /api/v1/chat/plan （SSE 流式）
 * Body：messages: { role: 'user'|'assistant', content: string }[]
 */
router.post('/plan', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
  res.setHeader('Connection', 'keep-alive');

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const today = dayjs().format('M月D日');
  const history = messages
    .filter((m: { role?: string; content?: string }) => m && typeof m.content === 'string')
    .slice(-10)
    .map((m: { role: string; content: string }) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));

  const msgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n今天是${today}。` },
    ...history,
  ];

  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);
    const stream = client.stream(msgs, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.7,
    });
    for await (const chunk of stream) {
      if (chunk.content) {
        res.write(`data: ${JSON.stringify({ text: chunk.content.toString() })}\n\n`);
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

export default router;