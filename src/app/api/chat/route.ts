import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askOurAI, type ChatTurn } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await requireUser("chat with Our AI");
  if (user instanceof NextResponse) return user;
  let body: { question?: string; history?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const q = (body.question ?? "").trim().slice(0, 600);
  if (!q) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  const history = Array.isArray(body.history) ? body.history.filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string") : [];
  return NextResponse.json(await askOurAI(q, history));
}
