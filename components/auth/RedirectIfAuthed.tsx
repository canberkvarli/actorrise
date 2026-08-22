"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { safeClientPath } from "@/lib/safe-redirect";

/**
 * Sends an already-signed-in visitor away from /login and /signup.
 *
 * This used to be middleware. Middleware runs BEFORE the CDN cache, so it
 * billed compute on every request to those pages even though both are static —
 * and Next fires ~7 segment requests per pageview, so /login (861 pageviews in
 * August) and / (769) together accounted for roughly 13,000 invocations a
 * month, each one constructing a Supabase server client and verifying a JWT.
 * That was the Fluid Active CPU bill.
 *
 * Doing it on the client costs nothing and is the right place for it anyway:
 * the session already lives in the browser, and an authenticated user landing
 * on /login is a rare, harmless case. The trade is a brief flash of the login
 * form before the redirect. Server-side protection of the actual private
 * routes (/dashboard, /profile, /admin, ...) is unchanged and still in
 * middleware, because that one really does need to happen before render.
 */
export function RedirectIfAuthed({ to = "/dashboard" }: { to?: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    // Honour ?redirect= so a login prompted from a deep link still returns
    // there, matching what the middleware did.
    const params = new URLSearchParams(window.location.search);
    router.replace(safeClientPath(params.get("redirect"), to));
  }, [user, loading, router, to]);

  return null;
}
