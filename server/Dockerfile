# ──────────────────────────────────────────────
#  Monolith Server — Node.js 部署 (PG + 本地FS)
#  Builder: tsc 编译 TypeScript → dist/
#  Runtime: 仅 prod 依赖 + dist/
# ──────────────────────────────────────────────

FROM node:22-alpine AS builder
WORKDIR /app

# 先拷依赖清单触发 Docker layer 缓存
COPY package.json package-lock.json ./
COPY server/package.json ./server/

# Workspaces install — 只安装 server 子包的依赖
# 注意: 根 package.json 是 workspaces 配置, 必须用 npm ci/install 处理整个 workspace
WORKDIR /app
RUN npm install --workspaces=false --include=dev || true
WORKDIR /app/server
RUN npm install --include=dev

# 拷源码
COPY server/src ./src
COPY server/tsconfig.json ./
COPY server/tsconfig.node.json ./

# 编译
RUN npx tsc -p tsconfig.node.json

# ──────── Runtime ────────
FROM node:22-alpine AS runtime
WORKDIR /app

# 仅安装生产依赖
COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 拷编译产物
COPY --from=builder /app/server/dist ./dist

# 数据卷：对象存储默认 /data/monolith-objects
RUN mkdir -p /data/monolith-objects
VOLUME ["/data/monolith-objects"]

ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV DB_PROVIDER=postgres
ENV STORAGE_PROVIDER=fs
ENV FS_ROOT=/data/monolith-objects
ENV AUTO_SCHEMA_MIGRATION=true

EXPOSE 8787

CMD ["node", "dist/index.node.js"]
