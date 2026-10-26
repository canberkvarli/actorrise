import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NEW_ACCOUNT_PARAM } from "@/lib/firstRun";

/** An account this young, signing in, has just been made. */
const NEW_ACCOUNT_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/practice";
  const provider = searchParams.get("provider"); // google | apple; for "last used" on login/signup
  // Use the request's origin so redirect stays on same host (avoids www vs non-www mismatch)
  const origin = requestUrl.origin;

  if (code) {
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
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect to the dashboard or specified next page; keep provider in URL so client can persist "last used"
      const redirectUrl = new URL(next, origin);
      // A brand-new account: the first-run curtain covers the app before it paints (lib/firstRun).
      const created = Date.parse(data.user?.created_at ?? "");
      if (Date.now() - created < NEW_ACCOUNT_MS) redirectUrl.searchParams.set(NEW_ACCOUNT_PARAM, "1");
      if (provider && (provider === "google" || provider === "apple")) {
        redirectUrl.searchParams.set("provider", provider);
        // Also set cookie as fallback (in case URL is stripped or client reads before nav)
        const res = NextResponse.redirect(redirectUrl.toString());
        res.cookies.set("actorrise_last_auth_method", provider, {
          path: "/",
          maxAge: 60 * 60,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
        return res;
      }
      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
