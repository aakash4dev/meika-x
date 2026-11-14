import { NextResponse } from "next/server";
import { MODEL, aiProvider } from "@/lib/ai/claude";
import { telegramEnabled } from "@/lib/telegram";
import { firmsEnabled } from "@/lib/nasa/firms";
import { schedulerInfo } from "@/lib/monitor/scheduler";

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

export async function GET() {
  const [power, eonet, gibs, cmr, provider] = await Promise.all([
    ping("https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=77&latitude=28&start=2020&end=2020&format=JSON"),
    ping("https://eonet.gsfc.nasa.gov/api/v3/categories"),
    ping("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0"),
    ping("https://cmr.earthdata.nasa.gov/search/collections.json?page_size=1"),
    aiProvider(),
  ]);
  return NextResponse.json({
    nasa: { power, eonet, gibs, cmr, firms: firmsEnabled() ? "configured" : "no key" },
    ai: { provider, model: MODEL },
    telegram: telegramEnabled(),
    scheduler: schedulerInfo(),
  });
}
