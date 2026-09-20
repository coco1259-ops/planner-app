/**
 * 排期图顶部署名·局部占比 预览脚本（Node 端）
 * 作用：复制 client 排期图渲染源码，仅把字体名替换为 Node 端已注册的中文字体，
 *      用 @napi-rs/canvas 真实执行渲染，生成 PNG 供放大对比署名词占比。
 *        ——不修改任何业务代码，仅用于预览。 ——
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';

// 注册中文字体
GlobalFonts.registerFromPath(
  '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
  'WenQuanYi Micro Hei'
);
GlobalFonts.registerFromPath(
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  'WenQuanYi Zen Hei'
);

// 读取 client 真实源码，复制到临时文件并替换字体名为 Node 可用的中文字体
const src = readFileSync('/workspace/projects/client/utils/scheduleImage.ts', 'utf-8');
// 把业务 font() 拼出的 CSS 字体串替换为 napi 能解析的标准简写（仅预览环境，不改业务代码）
const patched = src.replace(
  /const font = \(weight: number, size: number\) =>\s*`font-weight:\$\{weight\}; font-size:\$\{size\}px; font-family:-apple-system,'PingFang SC','Helvetica Neue',sans-serif;`;/,
  `const font = (weight: number, size: number) => \`\${weight} \${size}px WenQuanYi Micro Hei\`;`
);
// 支持通过环境变量覆盖 signSize(pad) 用于对比，直接替换原声明值
const tmpPath = '/workspace/projects/client/utils/scheduleImage.preview.ts';
let patchedFinal = patched;
if (process.env.SIGN_SIZE) {
  patchedFinal = patchedFinal.replace(/const signSize = 72;/, `const signSize = ${process.env.SIGN_SIZE};`);
  // 同步更新自检目标占比，避免放大后被自检拒绝（仅预览）
  patchedFinal = patchedFinal.replace(/署名占比: 12.5/, `署名占比: ${(+process.env.SIGN_SIZE / 576 * 100).toFixed(1)}`);
}
if (process.env.HEAD_PAD) {
  patchedFinal = patchedFinal.replace(/const pad = 18;/, `const pad = ${process.env.HEAD_PAD};`);
}
writeFileSync(tmpPath, patchedFinal);

(globalThis as any).document = {
  createElement: (_tag: string) => createCanvas(1152, 2176),
};

const mod = await import(tmpPath);
const render = (mod as any).renderScheduleImageCanvas as (i: any) => string;

const input = {
  projectName: 'D H A（14000）',
  scheduleType: '商单',
  clientName: '宝得聪',
  pubDate: '9月28日',
  stages: [
    { name: '大纲', date: '2026-09-28', done: true },
    { name: '拍摄', date: '2026-10-05', done: false },
    { name: '剪辑', date: '2026-10-12', done: false },
    { name: '发布', date: '2026-10-19', done: false },
  ],
};

try {
  const dataUrl = render(input);
  const b64 = dataUrl.split(',')[1];
  const file = process.argv[2] || '/tmp/preview_schedule.png';
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('saved', file);
} catch (e: any) {
  console.error('render fail:', e?.message);
  process.exit(1);
}