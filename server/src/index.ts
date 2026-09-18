import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import express from "express";
import cors from "cors";
import tasksRouter from "./routes/tasks";
import statsRouter from "./routes/stats";
import chatRouter from "./routes/chat";
import voiceRouter from "./routes/voice";

const app = express();
const port = process.env.PORT || 9091;

// ESM 环境下计算当前文件所在目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Routers
app.use('/api/v1/tasks', tasksRouter);
app.use('/api/v1/stats', statsRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/voice', voiceRouter);

// ---- 托管前端 Web 静态页面（便于手机浏览器直接访问 / 打开 App）----
const webDist = path.join(__dirname, "..", "public");
const hasWebDist = fs.existsSync(webDist) && fs.existsSync(path.join(webDist, "index.html"));

if (hasWebDist) {
  // 苹果触控图标与 favicon
  app.get('/favicon.ico', (_req, res) => {
    const f = path.join(webDist, 'favicon.ico');
    return fs.existsSync(f) ? res.sendFile(f) : res.status(204).end();
  });
  app.get('/apple-touch-icon.png', (_req, res) => {
    const f = path.join(webDist, 'apple-touch-icon.png');
    return fs.existsSync(f) ? res.sendFile(f) : res.status(204).end();
  });

  // 静态资源（_expo、assets 等）
  app.use(express.static(webDist));

  // 单页应用回退：非 /api/* 路由一律返回 index.html
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});