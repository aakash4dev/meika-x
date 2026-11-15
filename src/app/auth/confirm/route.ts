// Landing point for links in auth emails: sign-up confirmation and password reset.
// Handles both the token_hash links (our templates) and PKCE ?code= links (Supabase's default templates).
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  let failure = url.searchParams.get("error_description") ?? "This link is invalid or has expired.";

  const supabase = await createSupabaseServerClient();
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
    failure = error.message;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
    failure = error.message;
  }
  redirect(`/login?error=${encodeURIComponent(failure)}`);
}
