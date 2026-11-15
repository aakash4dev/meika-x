import { NextResponse } from "next/server";
import { aiProvider, modelFor } from "@/lib/ai/claude";
import { telegramEnabled } from "@/lib/telegram";
import { firmsEnabled } from "@/lib/nasa/firms";
import { schedulerInfo } from "@/lib/monitor/scheduler";
import { db } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ping(url: string) {
  const t = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return { ok: r.ok, ms: Date.now() - t, status: r.status };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, error: (e as Error).message };
  }
}

async function database() {
  const t = Date.now();
  const where = /127\.0\.0\.1|localhost/.test(SUPABASE_URL) ? "local" : "cloud";
  try {
    const { error } = await db().from("cases").select("id", { count: "exact", head: true });
    return { ok: !error, ms: Date.now() - t, where, error: error?.message };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, where, error: (e as Error).message };
  }
}

export async function GET() {
  const [power, eonet, gibs, cmr, provider, dbStatus] = await Promise.all([
    ping("https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=77&latitude=28&start=2020&end=2020&format=JSON"),
    ping("https://eonet.gsfc.nasa.gov/api/v3/categories"),
    ping("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0"),
    ping("https://cmr.earthdata.nasa.gov/search/collections.json?page_size=1"),
    aiProvider(),
    database(),
  ]);
  return NextResponse.json({
    nasa: { power, eonet, gibs, cmr, firms: firmsEnabled() ? "configured" : "no key" },
    ai: { provider, model: modelFor(provider) },
    database: dbStatus,
    telegram: telegramEnabled(),
    scheduler: schedulerInfo(),
  });
}
