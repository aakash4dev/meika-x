// Supabase connection settings. Local dev: values printed by `npm run db:start`.
// Vercel: the Supabase integration sets these names automatically.
// The site has no user accounts: only the server talks to Supabase, with the secret key.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";

export const CASE_IMAGES_BUCKET = "case-images";

export function missingSupabaseError() {
  return new Error(
    "Supabase is not configured. Run `npm run db:start` and copy the API URL and Secret key into .env.local (see .env.example).",
  );
}
