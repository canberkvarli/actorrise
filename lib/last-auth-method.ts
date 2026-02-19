/**
 * Persists which auth method was last used successfully (SSO or email).
 * Only updated after successful auth (OAuth callback or email login/signup).
 */

export const LAST_AUTH_METHOD_KEY = "actorrise_last_auth_method";

export type LastAuthMethod = "google" | "apple" | "twitter" | "email";

export function getStoredLastAuthMethod(): LastAuthMethod | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LAST_AUTH_METHOD_KEY);
    if (stored === "google" || stored === "apple" || stored === "twitter" || stored === "email") {
      return stored;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredLastAuthMethod(method: LastAuthMethod): void {
  try {
    localStorage.setItem(LAST_AUTH_METHOD_KEY, method);
  } catch {
    // ignore
  }
}
