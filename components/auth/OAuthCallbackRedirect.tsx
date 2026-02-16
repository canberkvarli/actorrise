"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * When Supabase OAuth redirects to /?code=... (root) instead of /auth/callback,
 * redirect to /auth/callback so the code can be exchanged. Handles cases where
 * middleware didn't run (e.g. edge/cache) or user landed on root with code.
 */
export function OAuthCallbackRedirect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== "/") return;
    const code = searchParams.get("code");
    if (!code) return;

    const next = searchParams.get("next") ?? "/dashboard";
    const params = new URLSearchParams();
    params.set("code", code);
    params.set("next", next);
    searchParams.forEach((value, key) => {
      if (key !== "code" && key !== "next") params.set(key, value);
    });
    window.location.replace(`/auth/callback?${params.toString()}`);
  }, [pathname, searchParams]);

  return null;
}
