import { NextResponse } from "next/server";
import { getReport } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rep = await getReport(id);
  if (!rep) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (new URL(req.url).searchParams.get("format") === "md") {
    return new Response(rep.markdown, {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${rep.id}.md"` },
    });
  }
  return NextResponse.json(rep);
}
