# 计划管家 - 后端自包含构建（Root Directory = server 时适用）
FROM node:22-slim AS builder
RUN npm install -g pnpm@9.0.0
WORKDIR /app
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build

# ---- 运行阶段 ----
FROM node:22-slim
ENV NODE_ENV=production
RUN npm install -g pnpm@9.0.0
WORKDIR /app
COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile
COPY --from=builder /app/dist ./dist
EXPOSE 9091
CMD ["node", "dist/index.js"]
