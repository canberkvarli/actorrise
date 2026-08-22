/**
 * Validation for `?redirect=` targets.
 *
 * The auth flow passes a return path through the query string so a login
 * prompted from a deep link lands back where it started. Anything that reads
 * that parameter and then navigates MUST run it through here first.
 *
 * `startsWith("/")` is not enough, and that is the trap this exists to close:
 * a protocol-relative URL like `//evil.com` also starts with a slash, and every
 * browser reads it as `https://evil.com`. Browsers also normalise backslashes
 * to slashes, so `/\evil.com` is the same trick. The result is an open
 * redirect — a link on our own domain that lands the actor somewhere else.
 *
 * That is nastier than usual in an auth flow, because the redirect fires
 * immediately AFTER a successful sign-in: the user has just proved the site is
 * real, and is then handed to an attacker's page primed to ask for something.
 *
 * Resolving against the true origin and comparing is what settles it. The
 * prefix checks only reject the obvious cases cheaply.
 */
export function safeInternalPath(
  raw: string | null | undefined,
  fallback: string,
  origin: string,
): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** Browser-side convenience wrapper. */
export function safeClientPath(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (typeof window === "undefined") return fallback;
  return safeInternalPath(raw, fallback, window.location.origin);
}
