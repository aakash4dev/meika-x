// Refreshes the Supabase auth session on each request so Server Components see a valid user.
// (Next.js 16 renamed middleware to proxy.)
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!URL_ || !KEY) return response;

  const supabase = createServerClient(URL_, KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet, headers) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  // Do not put code between createServerClient and getClaims: it validates and, if needed, refreshes the session.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    // everything except static assets, images, the globe texture and case images
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/globe-texture|api/cases/[^/]+/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
