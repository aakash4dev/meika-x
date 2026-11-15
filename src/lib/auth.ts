// Who is signed in. Pages stay public; opening cases, chatting and changing monitoring need an account.
import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseConfigured } from "./supabase/env";
import { createSupabaseServerClient } from "./supabase/server";

export interface SessionUser {
  id: string;
  email: string;
}

/** The signed-in user, verified with Supabase Auth, or null. */
export async function getUser(): Promise<SessionUser | null> {
  // Read cookies first: it marks the page as per-request even when Supabase is not configured at build time.
  await cookies();
  if (!supabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
  } catch {
    return null;
  }
}

/** For route handlers: the user, or a 401 response the client turns into a redirect to /login. */
export async function requireUser(action: string): Promise<SessionUser | NextResponse> {
  const user = await getUser();
  if (user) return user;
  return NextResponse.json({ error: `Sign in to ${action}.`, login: true }, { status: 401 });
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: unknown, fallback = "/"): string {
  const ok = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login");
  return ok ? (next as string) : fallback;
}

/** Public origin of this site, for links in auth emails. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
