import { NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST() {
  const res = await sendTelegram("MEIKA-X test message: Telegram alerts are connected. 🛰️");
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
