// Server-only Supabase client with the secret (service-role) key. Bypasses Row Level Security,
// so it must never reach the browser. All app data is read and written through it.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, missingSupabaseError } from "./env";

const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type G = typeof globalThis & { __meikaDb?: SupabaseClient };
const g = globalThis as G;

export function db(): SupabaseClient {
  if (g.__meikaDb) return g.__meikaDb;
  if (!SUPABASE_URL || !SECRET_KEY) throw missingSupabaseError();
  g.__meikaDb = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return g.__meikaDb;
}

/** Throw a readable error from a Supabase response. */
export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Database error (${what}): ${res.error.message}`);
  return res.data;
}
