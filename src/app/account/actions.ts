"use server";

import { redirect } from "next/navigation";
import { isDemoUser } from "@/lib/demo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthState } from "../login/actions";

export async function updatePassword(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords do not match." };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your session expired. Sign in again." };
  if (isDemoUser(data.user.email)) return { error: "The shared demo account's password cannot be changed." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.code === "same_password" ? "That is already your password." : error.message };
  return { message: "Password updated." };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
