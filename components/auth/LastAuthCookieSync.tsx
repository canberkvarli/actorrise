"use client";

import { useEffect } from "react";
import { setStoredLastAuthMethod, type LastAuthMethod } from "@/lib/last-auth-method";

const COOKIE_NAME = "actorrise_last_auth_method";

function readAndClearLastAuthCookie(): LastAuthMethod | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]).trim() : null;
  if (value !== "google" && value !== "apple" && value !== "twitter" && value !== "email") return null;
  // Clear the cookie
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  return value as LastAuthMethod;
}

/**
 * Runs in root layout so it runs on every page (including /login).
 * After OAuth, the callback sets a cookie; we copy it to localStorage here
 * so "Last used" badge shows for Google/Apple on the sign-in page.
 */
export function LastAuthCookieSync() {
  useEffect(() => {
    const method = readAndClearLastAuthCookie();
    if (method) setStoredLastAuthMethod(method);
  }, []);
  return null;
}
