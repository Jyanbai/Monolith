# ──────────────────────────────────────────────
#  Monolith Server — Node.js 部署 (PG + 本地FS)
# ──────────────────────────────────────────────

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/

WORKDIR /app
RUN npm install --workspaces=false --include=dev || true
WORKDIR /app/server
RUN npm install --include=dev

COPY server/src ./src
COPY server/scripts ./scripts
COPY server/tsconfig.json ./
COPY server/tsconfig.node.json ./

# 编译 + 修补 ESM 扩展名（tsc bundler resolution 不输出 .js, Node ESM 需要）
RUN npx tsc -p tsconfig.node.json --noCheck && node scripts/fix-esm-imports.mjs dist

# ──────── Runtime ────────
FROM node:22-alpine AS runtime
WORKDIR /app

COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/server/dist ./dist

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
