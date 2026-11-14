import { promises as fs } from "fs";
import { dataPath } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params;
  if (!/^[\w-]+$/.test(id) || !["recent", "prior"].includes(name)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(dataPath("cases", id, `${name}.jpg`));
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
