# 计划管家后端 - 生产镜像（用于 Railway / Docker 部署）
# 通过固定步骤构建，避免 NixPacks 对 monorepo 的误判

# ---------- 构建阶段 ----------
FROM node:22-slim AS builder

# 启用 pnpm
RUN npm i -g corepack && corepack enable

WORKDIR /app

# 复制 workspace 清单
COPY package.json pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json

# 安装依赖（仅安装，后续构建）
RUN pnpm install --filter server... --no-frozen-lockfile

# 复制后端源码
COPY server ./server

# 构建（产出 dist/index.js）
RUN cd server && pnpm build

# ---------- 运行阶段（精简镜像） ----------
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9091

# 从构建阶段复制依赖与产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY server/package.json ./server/package.json

WORKDIR /app/server

EXPOSE 9091

# 启动命令（Railway 会注入 PORT，此处兼容缺省）
CMD ["node", "dist/index.js"]