// App data lives in Supabase (see src/lib/supabase). This file keeps the small local helpers:
// record ids, and a scratch folder for the NASA response cache and temporary images.
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

/** Local scratch space. Vercel functions can only write to the temp directory, and it does not persist. */
export const LOCAL_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "meika-x") : path.join(process.cwd(), ".data");

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export const localPath = (...p: string[]) => path.join(LOCAL_DIR, ...p);

export const newId = (prefix: string) =>
  `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex")}`;
