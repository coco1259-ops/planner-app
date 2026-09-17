# 「计划管家」后端公网部署手册

为了让手机在**任何网络**都能使用 App（AI 排程、语音、数据都走此后端），需要把后端 Express 服务部署到一个
**公网可访问**的云平台。本手册使用 **Render（免费档）** 作为示例，其他平台（Fly.io 等）逻辑相同。

> 前置：本目录 `pnpm run build` 已能把代码打成单个 `dist/index.js`，云平台直接运行它即可。

## 一、后端需要配置的环境变量

| 变量 | 说明 | 从哪里拿 |
|------|------|----------|
| `PORT` | 进程端口，云平台会自动注入，通常无需手动填 | 平台自动 |
| `COZE_SUPABASE_URL` | Supabase 项目地址 | Supabase 后台 → Project Settings → API |
| `COZE_SUPABASE_ANON_KEY` | Supabase 匿名公钥 | 同上 |
| `COZE_SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务角色密钥（增删改数据用） | 同上 |
| `PLAN_AGENT_URL` | 你的「计划管家」agent 公网地址 | 扣子平台该 agent 的部署 URL |
| `COZE_WORKLOAD_API_TOKEN` | 调用 agent 的 workload token | 扣子平台 → 目标项目/工作负载 |
| `PLAN_AGENT_SESSION` | 会话标识 | 自己填个固定字符串即可 |
| `OVERLOAD_WORK_MINUTES` | 每日可用分钟数，默认 480（8 小时） | 可省 |

> ⚠️ **数据说明**：当前数据库用的是沙箱内的 Supabase（`COZE_SUPABASE_*`）。部署到公网时，
> **推荐使用你自己新建的 Supabase 项目**并在其中建好与 `server/src/storage/database/shared/schema.ts` 一致的
> `tasks` 表（并放行该后端 IP / 开启自愈），保证数据稳定、安全、可长期使用。

## 二、在 Render 上部署（免费档示例）

1. 在 https://render.com 注册账号（免费）。
2. 登录后点 **New → Web Service**，连接你的代码仓库（把本项目推到 GitHub 即可）或选择其他导入方式。
3. 服务配置：
   - **Root Directory**：`server`（只部署后端这一层）
   - **Build Command**：`pnpm install --frozen-lockfile && pnpm run build`
   - **Start Command**：`node dist/index.js`
   - 注意把运行命令里的端口交给 Render 注入的 `PORT`。
4. 在 **Environment** 里填入上表所有变量（Supabase 一定要用你的项目）。
5. 点击 **Create Web Service**。部署完成后会得到一个 `https://xxx.onrender.com` 公网地址。
6. 用浏览器访问 `https://xxx.onrender.com/api/v1/health`，返回 `{"status":"ok"}` 即成功。

## 三、把前端指向该公网后端

手机上的 App 通过 `EXPO_PUBLIC_BACKEND_BASE_URL` 决定连哪个后端。公网部署后，把它设置为你的
`https://xxx.onrender.com`（不带末尾斜杠）。前端在打包/构建时读取该变量。

> 由于当前工程运行在 coze 沙箱，`EXPO_PUBLIC_BACKEND_BASE_URL` 由沙箱自动注入为沙箱内网地址，
> 公网打包时需显式覆盖为该公网后端地址。

## 四、让手机打开「计划管家」（Expo Go）

有两种方式让手机用 `Expo Go` 从任意网络打开本项目：

- **方式 A（推荐）EAS Update 云托管**：
  1. 注册 Expo 账号：https://expo.dev (免费)；
  2. 在 `client/` 里 `npx eas-cli login`，随后 `npx eas-cli update:configure --non-interactive`；
  3. `npx eas-cli update` 把前端 JS 上传到 Expo 云端；
  4. 手机装 `Expo Go`，用浏览器打开生成的链接 / 扫对应二维码即可从任意网络运行。

- 方式 B：需要保持一个公网可访问的 `expo start` 开发服务（较繁琐，仅临时方案）。

## 五、验收清单（手机端）

- [ ] 手机用 Expo Go 打开「计划管家」（点开排程对话有回答）
- [ ] 手机不在家中网络（如用 4G/5G）也能加载数据与 AI 对话
- [ ] Supabase 后台能看到手机产生的任务数据
- [ ] 语音按钮转文字正常（若依赖语音转写，需 ASR 凭证也可用）