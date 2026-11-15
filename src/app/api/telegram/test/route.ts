import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST() {
  const user = await requireUser("send a Telegram test");
  if (user instanceof NextResponse) return user;
  const res = await sendTelegram("MEIKA-X test message: Telegram alerts are connected. 🛰️");
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
