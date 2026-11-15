// Supabase connection settings. Local dev: values printed by `npm run db:start`.
// Vercel: the Supabase integration sets these names automatically (either naming scheme works).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";

/** Public key (publishable / anon). Safe in the browser; Row Level Security limits what it can do. */
export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);

export const CASE_IMAGES_BUCKET = "case-images";

export function missingSupabaseError() {
  return new Error(
    "Supabase is not configured. Run `npm run db:start` and copy the URL and keys into .env.local (see .env.example).",
  );
}
