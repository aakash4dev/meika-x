// Per-request Supabase client bound to the visitor's auth cookies (Server Components, Server Actions, Route Handlers).
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, missingSupabaseError } from "./env";

export async function createSupabaseServerClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) throw missingSupabaseError();
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes the session instead.
        }
      },
    },
  });
}
