"use server";

import { redirect } from "next/navigation";
import { safeNext, siteOrigin } from "@/lib/auth";
import { DEMO_EMAIL, demoLoginEnabled, demoPassword, ensureDemoUser } from "@/lib/demo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function signIn(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = field(fd, "email");
  const password = String(fd.get("password") ?? "");
  const next = safeNext(fd.get("next"));
  if (!email || !password) return { error: "Enter your email and password." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "Confirm your email first: open the link we sent you, then sign in." };
    return { error: error.code === "invalid_credentials" ? "Wrong email or password." : error.message };
  }
  redirect(next);
}

export async function signUp(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = field(fd, "email");
  const password = String(fd.get("password") ?? "");
  const next = safeNext(fd.get("next"));
  if (!email || !password) return { error: "Enter an email and a password." };
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords do not match." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.code === "weak_password" ? "That password is too weak. Try a longer one." : error.message };
  if (data.session) redirect(next); // email confirmation switched off in this project
  return { message: `Almost there: we sent a confirmation link to ${email}. Open it to finish creating your account.` };
}

/** "Continue without an account": signs in to the shared demo account (full access). */
export async function signInAsDemo(_prev: AuthState, fd: FormData): Promise<AuthState> {
  if (!demoLoginEnabled()) return { error: "The demo login is switched off on this server." };
  const next = safeNext(fd.get("next"));
  const supabase = await createSupabaseServerClient();
  let { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: demoPassword() });
  if (error) {
    // first use on this database, or the demo password changed: (re)create the account and try again
    try {
      await ensureDemoUser();
    } catch (e) {
      return { error: (e as Error).message };
    }
    ({ error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: demoPassword() }));
    if (error) return { error: `Demo login failed: ${error.message}` };
  }
  redirect(next);
}

export async function sendPasswordReset(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = field(fd, "email");
  if (!email) return { error: "Enter the email you signed up with." };
  if (email.toLowerCase() === DEMO_EMAIL.toLowerCase()) return { error: "The demo account has no password to reset. Use “Continue with the demo account”." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent("/account?reset=1")}`,
  });
  if (error) return { error: error.message };
  return { message: `If ${email} has an account, a reset link is on its way.` };
}
