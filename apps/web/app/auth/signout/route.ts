import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Server-side sign-out: clears Supabase auth cookies and redirects.
 * Clears cookies explicitly on the redirect response so they are always sent.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectTo = requestUrl.searchParams.get("redirect") ?? "/";

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore if called from context that can't set cookies
          }
        },
      },
    }
  );

  await supabase.auth.signOut();

  // Only allow same-origin redirects to prevent open redirect
  const redirectUrl = new URL(redirectTo, requestUrl.origin);
  if (redirectUrl.origin !== requestUrl.origin) {
    redirectUrl.href = new URL("/", requestUrl.origin).href;
  }

  // Build redirect and explicitly clear all Supabase auth cookies on this response.
  const response = NextResponse.redirect(redirectUrl, 302);
  const all = cookieStore.getAll();
  for (const c of all) {
    if (c.name.startsWith("sb-")) {
      response.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    }
  }
  return response;
}
