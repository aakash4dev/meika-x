import { globeTexture } from "@/lib/nasa/gibs";

export const runtime = "nodejs";

export async function GET() {
  try {
    const buf = await globeTexture();
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800" } });
  } catch (e) {
    return new Response((e as Error).message, { status: 502 });
  }
}
