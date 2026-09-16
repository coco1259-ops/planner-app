import { Router } from 'express';
import multer from 'multer';
import { Config, HeaderUtils, ASRClient } from 'coze-coding-dev-sdk';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * 服务端文件：server/src/routes/voice.ts
 * 接口：POST /api/v1/voice/asr （multipart/form-data，字段名 file）
 * 参数：file: binary（前端通过 FormData 上传录音文件）
 */
router.post('/asr', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: '缺少音频文件' });
    const base64Data = file.buffer.toString('base64');
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const asr = new ASRClient(config, customHeaders);
    const result = await asr.recognize({ base64Data });
    res.json({ text: result.text ?? '' });
  } catch (e) {
    res.status(500).json({ error: '语音识别失败' });
  }
});

export default router;