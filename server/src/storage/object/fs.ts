/* ──────────────────────────────────────────────
   本地文件系统适配器 — Node.js 部署专用
   把 R2/S3 的对象语义映射到 <root>/<key> 文件
   元数据 (contentType) 存到伴生 <key>.meta.json
   ────────────────────────────────────────────── */

import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import type { IObjectStorage, StorageObject, StorageListItem } from "../interfaces";

type Meta = {
  contentType?: string;
  customMetadata?: Record<string, string>;
  uploaded: string;
};

export class FsAdapter implements IObjectStorage {
  constructor(private root: string) {}

  private resolve(key: string): string {
    // 防止路径穿越：normalize 并断言仍在 root 内
    const safe = path.posix.normalize(key).replace(/^(\.\.[/\\])+/, "");
    const full = path.resolve(this.root, safe);
    if (!full.startsWith(path.resolve(this.root))) {
      throw new Error(`非法的 key: ${key}`);
    }
    return full;
  }

  private metaPath(filePath: string): string {
    return filePath + ".meta.json";
  }

  async put(
    key: string,
    data: ReadableStream | ArrayBuffer | string,
    options?: { contentType?: string; customMetadata?: Record<string, string> }
  ): Promise<void> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let buf: Buffer;
    if (typeof data === "string") {
      buf = Buffer.from(data);
    } else if (data instanceof ArrayBuffer) {
      buf = Buffer.from(data);
    } else {
      // ReadableStream → Buffer
      const chunks: Buffer[] = [];
      const reader = (data as ReadableStream).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      buf = Buffer.concat(chunks);
    }
    await fs.writeFile(filePath, buf);

    const meta: Meta = {
      contentType: options?.contentType,
      customMetadata: options?.customMetadata,
      uploaded: new Date().toISOString(),
    };
    await fs.writeFile(this.metaPath(filePath), JSON.stringify(meta));
  }

  async get(key: string): Promise<StorageObject | null> {
    const filePath = this.resolve(key);
    try {
      await fs.access(filePath);
    } catch {
      return null;
    }
    let meta: Meta = { uploaded: new Date().toISOString() };
    try {
      meta = JSON.parse(await fs.readFile(this.metaPath(filePath), "utf-8"));
    } catch { /* meta optional */ }

    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
    const contentType = meta.contentType || "application/octet-stream";

    return {
      body: webStream,
      contentType,
      writeHeaders(headers: Headers) {
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
      },
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolve(key);
    await fs.rm(filePath, { force: true });
    await fs.rm(this.metaPath(filePath), { force: true });
  }

  async list(prefix: string, limit = 50): Promise<StorageListItem[]> {
    const safePrefix = path.posix.normalize(prefix).replace(/^(\.\.[/\\])+/, "");
    const baseDir = path.resolve(this.root, safePrefix);
    const items: StorageListItem[] = [];

    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (items.length >= limit) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && !entry.name.endsWith(".meta.json")) {
          const stat = await fs.stat(full);
          items.push({
            key: path.relative(baseDir, full).split(path.sep).join("/"),
            size: stat.size,
            uploaded: stat.mtime.toISOString(),
          });
        }
      }
    }

    // 若 prefix 指向具体目录则从其中开始；否则当作前缀字符串扫描父目录
    try {
      const stat = await fs.stat(baseDir);
      if (stat.isDirectory()) {
        await walk(baseDir);
        return items;
      }
    } catch { /* not a dir */ }

    // prefix 是文件名前缀
    const parent = path.dirname(baseDir);
    const namePrefix = path.basename(baseDir);
    try {
      const entries = await fs.readdir(parent, { withFileTypes: true });
      for (const entry of entries) {
        if (items.length >= limit) break;
        if (entry.isFile() && entry.name.startsWith(namePrefix) && !entry.name.endsWith(".meta.json")) {
          const full = path.join(parent, entry.name);
          const stat = await fs.stat(full);
          items.push({
            key: path.relative(this.root, full).split(path.sep).join("/"),
            size: stat.size,
            uploaded: stat.mtime.toISOString(),
          });
        }
      }
    } catch { /* parent missing */ }
    return items;
  }
}
