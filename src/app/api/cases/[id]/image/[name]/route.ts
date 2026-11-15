import { db } from "@/lib/supabase/admin";
import { CASE_IMAGES_BUCKET } from "@/lib/supabase/env";

export const runtime = "nodejs";

/** Satellite snapshot of a case, served from Supabase Storage under a stable same-origin URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params;
  if (!/^[\w-]+$/.test(id) || !["recent", "prior"].includes(name)) return new Response("Not found", { status: 404 });
  const { data, error } = await db().storage.from(CASE_IMAGES_BUCKET).download(`${id}/${name}.jpg`);
  if (error || !data) return new Response("Not found", { status: 404 });
  return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, immutable" } });
}
