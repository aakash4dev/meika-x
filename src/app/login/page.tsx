import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import { getUser, safeNext } from "@/lib/auth";
import { demoLoginEnabled } from "@/lib/demo";
import { supabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · MEIKA-X" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  if (await getUser()) redirect(next);
  const mode = sp.mode === "signup" ? "signup" : sp.mode === "reset" ? "reset" : "signin";
  return (
    <main className="container auth-page">
      {supabaseConfigured() ? (
        <AuthForm next={next} initialMode={mode} initialError={typeof sp.error === "string" ? sp.error : undefined} demo={demoLoginEnabled()} />
      ) : (
        <div className="empty">Accounts are not set up on this server yet: Supabase is not configured (see the README).</div>
      )}
    </main>
  );
}
