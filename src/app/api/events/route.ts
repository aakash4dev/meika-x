import { NextResponse } from "next/server";
import { fetchEvents } from "@/lib/nasa/eonet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await fetchEvents({ status: "open", days: 30, limit: 400 });
    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
