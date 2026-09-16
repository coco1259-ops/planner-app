import express from "express";
import cors from "cors";
import tasksRouter from "./routes/tasks";
import statsRouter from "./routes/stats";
import chatRouter from "./routes/chat";
import voiceRouter from "./routes/voice";

const app = express();
const port = process.env.PORT || 9091;

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

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});