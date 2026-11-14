// Tiny JSON-file store under .data/ (no database needed for a hackathon build).
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export const DATA_DIR = path.join(process.cwd(), ".data");

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJSON(file: string, data: unknown) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

export const newId = (prefix: string) =>
  `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex")}`;

export const dataPath = (...p: string[]) => path.join(DATA_DIR, ...p);

export async function listJSON<T>(dir: string): Promise<T[]> {
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const items = await Promise.all(files.map((f) => readJSON<T | null>(path.join(dir, f), null)));
    return items.filter((x): x is Awaited<T> => x !== null) as T[];
  } catch {
    return [];
  }
}
