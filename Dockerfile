# SiteLens 独立站分析工具 — 生产镜像
# 零第三方依赖，无需 npm install；server.js 已支持 PORT 环境变量与 0.0.0.0 监听
FROM node:22-alpine

WORKDIR /app

# 仅复制运行时必需文件
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts

# 平台注入的端口（Railway/Render/Fly 均通过 PORT 环境变量提供）
ENV PORT=8720
ENV NODE_ENV=production

EXPOSE 8720

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/api/health" >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
