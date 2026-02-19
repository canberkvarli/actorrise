"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { setStoredLastAuthMethod, type LastAuthMethod } from "@/lib/last-auth-method";

const COOKIE_NAME = "actorrise_last_auth_method";
const VALID_OAUTH: LastAuthMethod[] = ["google", "apple"];

function readAndClearLastAuthCookie(): LastAuthMethod | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]).trim() : null;
  if (!VALID_OAUTH.includes(value as LastAuthMethod)) return null;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  return value as LastAuthMethod;
}

/**
 * Runs in root layout so it runs on every page (including /dashboard after OAuth).
 * Persists "last used" from (1) URL ?provider= or (2) cookie so the badge shows
 * for Google/Apple on the sign-in page after logout.
 */
export function LastAuthCookieSync() {
  const searchParams = useSearchParams();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;

    // 1) Prefer URL param (reliable after OAuth redirect to /dashboard?provider=google)
    const urlProvider = searchParams.get("provider");
    if (urlProvider === "google" || urlProvider === "apple") {
      setStoredLastAuthMethod(urlProvider as LastAuthMethod);
      done.current = true;
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("provider");
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch {
        // ignore
      }
      return;
    }

    // 2) Fallback: cookie (in case URL was stripped)
    const cookieMethod = readAndClearLastAuthCookie();
    if (cookieMethod) {
      setStoredLastAuthMethod(cookieMethod);
      done.current = true;
    }
  }, [searchParams]);

  return null;
}
