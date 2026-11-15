import { NextResponse, after } from "next/server";
import { requireUser } from "@/lib/auth";
import { createCase, runCase } from "@/lib/agents/pipeline";
import { countRunningCases, listCases } from "@/lib/agents/runtime";
import type { CaseRequest } from "@/lib/agents/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The case runs after the response is sent (after()), within this function's time limit.
export const maxDuration = 300;

export async function GET() {
  const cases = await listCases(50);
  return NextResponse.json(
    cases.map((c) => ({
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
  const user = await requireUser("open a case");
  if (user instanceof NextResponse) return user;
  let body: CaseRequest;
  try {
    body = (await req.json()) as CaseRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  if ((await countRunningCases()) >= 3) return NextResponse.json({ error: "Three cases are already running. Try again in a minute." }, { status: 429 });
  const ctx = await createCase(body, user.id);
  after(() => runCase(ctx, body));
  return NextResponse.json({ id: ctx.id }, { status: 201 });
}
