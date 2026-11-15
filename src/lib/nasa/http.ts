// Fetch helper with a local disk cache (best effort; a temp folder on Vercel) and a small concurrency limiter, shared by all NASA clients.
import crypto from "crypto";
import { promises as fs } from "fs";
import { ensureDir, localPath } from "../store";

const UA = "MEIKA-X/0.1 (NASA Space Apps 2026 project)";

let active = 0;
const queue: (() => void)[] = [];
const MAX_CONCURRENT = 4;

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

export interface CachedFetchOptions {
  ttlSeconds: number;
  timeoutMs?: number;
  retries?: number;
}

async function rawFetch(url: string, timeoutMs: number, retries: number): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function cacheFile(url: string, ext: string) {
  const h = crypto.createHash("sha1").update(url).digest("hex");
  return localPath("cache", `${h}.${ext}`);
}

async function fresh(file: string, ttl: number) {
  try {
    const st = await fs.stat(file);
    return (Date.now() - st.mtimeMs) / 1000 < ttl;
  } catch {
    return false;
  }
}

export async function cachedJSON<T>(url: string, opts: CachedFetchOptions): Promise<T> {
  const file = cacheFile(url, "json");
  if (await fresh(file, opts.ttlSeconds)) return JSON.parse(await fs.readFile(file, "utf8"));
  return slot(async () => {
    const res = await rawFetch(url, opts.timeoutMs ?? 60000, opts.retries ?? 2);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as T;
    await ensureDir(localPath("cache"));
    await fs.writeFile(file, JSON.stringify(data));
    return data;
  });
}

export async function cachedText(url: string, opts: CachedFetchOptions): Promise<string> {
  const file = cacheFile(url, "txt");
  if (await fresh(file, opts.ttlSeconds)) return fs.readFile(file, "utf8");
  return slot(async () => {
    const res = await rawFetch(url, opts.timeoutMs ?? 60000, opts.retries ?? 2);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    const text = await res.text();
    await ensureDir(localPath("cache"));
    await fs.writeFile(file, text);
    return text;
  });
}

export async function cachedBinary(url: string, opts: CachedFetchOptions): Promise<Buffer> {
  const file = cacheFile(url, "bin");
  if (await fresh(file, opts.ttlSeconds)) return fs.readFile(file);
  return slot(async () => {
    const res = await rawFetch(url, opts.timeoutMs ?? 60000, opts.retries ?? 2);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await ensureDir(localPath("cache"));
    await fs.writeFile(file, buf);
    return buf;
  });
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
