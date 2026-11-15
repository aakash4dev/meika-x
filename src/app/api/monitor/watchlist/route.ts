import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { addWatchItem, getAlerts, getMonitorState, getWatchlist, isMonitorRunning, removeWatchItem } from "@/lib/monitor/runner";
import { schedulerInfo } from "@/lib/monitor/scheduler";
import { telegramEnabled } from "@/lib/telegram";
import { firmsEnabled } from "@/lib/nasa/firms";
import { validBBox } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [watchlist, alerts, state] = await Promise.all([getWatchlist(), getAlerts(100), getMonitorState()]);
  return NextResponse.json({
    watchlist,
    alerts,
    state: { lastRun: state.lastRun, lastTrigger: state.lastTrigger, runs: state.runs, lastError: state.lastError },
    running: isMonitorRunning(),
    scheduler: schedulerInfo(),
    telegram: telegramEnabled(),
    firms: firmsEnabled(),
  });
}

export async function POST(req: Request) {
  const user = await requireUser("change the watchlist");
  if (user instanceof NextResponse) return user;
  try {
    const body = await req.json();
    if (!body.regionId && !validBBox(body.bbox)) return NextResponse.json({ error: "Pick a region or give a valid box (max 20 x 20 degrees)." }, { status: 400 });
    const item = await addWatchItem(body, user.id);
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const user = await requireUser("change the watchlist");
  if (user instanceof NextResponse) return user;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await removeWatchItem(id);
  return NextResponse.json({ ok: true });
}
