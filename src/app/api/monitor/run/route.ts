import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runMonitor } from "@/lib/monitor/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Manual run from the dashboard. */
export async function POST() {
  const user = await requireUser("run the checks");
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(await runMonitor("manual"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Scheduled run. Vercel Cron sends "Authorization: Bearer CRON_SECRET"; other crons can use ?secret=CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || given !== secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await runMonitor("cron"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
