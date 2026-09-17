# 计划管家 - 后端自包含构建（Root Directory = server 时适用）
# 此 Dockerfile 以 server/ 目录为构建根上下文，不依赖仓库根目录

# ---- 构建阶段 ----
FROM node:22-slim AS builder
RUN npm install -g pnpm@9.0.0
WORKDIR /app
# 先装依赖（利用 layer 缓存）
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
# 复制源码并构建（esbuild 打包到 dist/）
COPY . .
RUN pnpm build

# ---- 运行阶段 ----
FROM node:22-slim
ENV NODE_ENV=production
RUN npm install -g pnpm@9.0.0
WORKDIR /app
# 只安装生产依赖，确保 node_modules 完整且无符号链接问题
COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile
# 复制构建产物
COPY --from=builder /app/dist ./dist
EXPOSE 9091
CMD ["node", "dist/index.js"]