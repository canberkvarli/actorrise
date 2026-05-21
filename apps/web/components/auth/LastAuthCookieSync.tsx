"use client";

import { useEffect, useRef } from "react";
import {
  setStoredLastAuthMethod,
  PENDING_OAUTH_PROVIDER_KEY,
  type LastAuthMethod,
} from "@/lib/last-auth-method";

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

function readAndClearPendingProvider(): LastAuthMethod | null {
  if (typeof window === "undefined") return null;
  try {
    const p = window.sessionStorage.getItem(PENDING_OAUTH_PROVIDER_KEY);
    if (p !== "google" && p !== "apple") return null;
    window.sessionStorage.removeItem(PENDING_OAUTH_PROVIDER_KEY);
    return p as LastAuthMethod;
  } catch {
    return null;
  }
}

/**
 * Fallback: persist "last used" from sessionStorage (set when user clicked OAuth), URL, or cookie.
 * Inline script in root layout runs first; this handles any case the script missed.
 */
export function LastAuthCookieSync() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;

    // 1) sessionStorage (set when user clicked "Continue with Google/Apple")
    const pending = readAndClearPendingProvider();
    if (pending) {
      setStoredLastAuthMethod(pending);
      done.current = true;
      return;
    }

    // 2) URL param
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

    // 3) Cookie
    const cookieMethod = readAndClearLastAuthCookie();
    if (cookieMethod) {
      setStoredLastAuthMethod(cookieMethod);
      done.current = true;
    }
  }, []);

  return null;
}
