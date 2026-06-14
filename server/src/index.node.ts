/* ──────────────────────────────────────────────
   Monolith Server — Node.js 入口
   通过 @hono/node-server 在 Node 22 + PG + 本地 FS 上运行
   ────────────────────────────────────────────── */

import { serve } from "@hono/node-server";
import cron from "node-cron";
import { createDatabase } from "./storage/factory.js";

// 默认走 PG + FS 路径（在 import handler 之前设置，免得 factory 内部已读到 d1）
process.env.DB_PROVIDER = process.env.DB_PROVIDER || "postgres";
process.env.STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "fs";
process.env.AUTO_SCHEMA_MIGRATION = process.env.AUTO_SCHEMA_MIGRATION || "true";

// Workers 默认入口 — { fetch, scheduled }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (await import("./index.js")).default as { fetch: (req: Request, env: any, ctx: any) => Promise<Response> | Response };

const PORT = parseInt(process.env.PORT || "8787", 10);
const HOST = process.env.HOST || "0.0.0.0";

// executionCtx polyfill — Workers 的 waitUntil 在 Node 下转成 fire-and-forget
const makeCtx = () => ({
  waitUntil: (p: Promise<unknown>) => {
    Promise.resolve(p).catch((err) => console.error("[waitUntil] background task failed:", err));
  },
  passThroughOnException: () => {},
});

serve({
  fetch: (req: Request) => handler.fetch(req, process.env, makeCtx()),
  port: PORT,
  hostname: HOST,
}, (info) => {
  console.log(`[monolith-server] listening on http://${info.address}:${info.port}`);
  console.log(`[monolith-server] DB_PROVIDER=${process.env.DB_PROVIDER} STORAGE_PROVIDER=${process.env.STORAGE_PROVIDER}`);
});

// Cron: 每分钟检查一次定时发布（替代 Workers [triggers].crons）
cron.schedule("* * * * *", async () => {
  try {
    const db = await createDatabase(process.env as unknown as Record<string, unknown>);
    const count = await db.publishScheduledPosts();
    if (count > 0) {
      console.log(`[Cron] Published ${count} scheduled posts.`);
    }
  } catch (err) {
    console.error("[Cron] publishScheduledPosts failed:", err);
  }
});

const shutdown = (sig: string) => {
  console.log(`[monolith-server] received ${sig}, exiting...`);
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));
