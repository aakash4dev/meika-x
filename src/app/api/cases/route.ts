import { NextResponse } from "next/server";
import { createCase, runCase } from "@/lib/agents/pipeline";
import { listCases } from "@/lib/agents/runtime";
import type { CaseRequest } from "@/lib/agents/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cases = await listCases();
  return NextResponse.json(
    cases.slice(0, 50).map((c) => ({
      id: c.id,
      question: c.question,
      status: c.status,
      createdAt: c.createdAt,
      grade: c.results.grade ?? null,
      variable: c.plan?.variableName ?? null,
      region: c.plan?.regionName ?? null,
      verdict: c.results.verdict ?? null,
    })),
  );
}

export async function POST(req: Request) {
  let body: CaseRequest;
  try {
    body = (await req.json()) as CaseRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  const running = (await listCases()).filter((c) => c.status === "running").length;
  if (running >= 3) return NextResponse.json({ error: "Three cases are already running. Try again in a minute." }, { status: 429 });
  const ctx = createCase(body);
  void runCase(ctx, body);
  return NextResponse.json({ id: ctx.id }, { status: 201 });
}
