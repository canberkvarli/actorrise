"use client";

import { useEffect, useRef } from "react";
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

function getProviderFromUrl(): LastAuthMethod | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const p = params.get("provider");
  return p === "google" || p === "apple" ? (p as LastAuthMethod) : null;
}

/**
 * Runs in root layout so it runs on every page (including /dashboard after OAuth).
 * Persists "last used" from (1) URL ?provider= or (2) cookie so the badge shows
 * for Google/Apple on the sign-in page after logout. Uses window.location so we
 * don't depend on useSearchParams() in the root layout.
 */
export function LastAuthCookieSync() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;

    // 1) URL param (after OAuth redirect to /dashboard?provider=google)
    const urlProvider = getProviderFromUrl();
    if (urlProvider) {
      setStoredLastAuthMethod(urlProvider);
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

    // 2) Fallback: cookie
    const cookieMethod = readAndClearLastAuthCookie();
    if (cookieMethod) {
      setStoredLastAuthMethod(cookieMethod);
      done.current = true;
    }
  }, []);

  return null;
}
