/**
 * Which language a visitor sees, decided in the browser.
 *
 * WHY NOT ON THE SERVER. Reading a cookie or a geo header in a layout makes
 * every page under it dynamic. The ~12k /monologues/* pages and the homepage
 * are static or ISR, served from the CDN, and the middleware matcher was cut
 * down to a handful of paths to stay under Vercel's Fluid Active CPU ceiling
 * (see middleware.ts). A server-side locale would undo both. So the HTML ships
 * in English and the client switches it on hydration.
 *
 * WHY THE TIMEZONE, NOT THE IP. "Is this visitor in Turkey" is answered by the
 * device clock for free: Europe/Istanbul is the only zone Turkey uses. An IP
 * lookup would need a server round trip per new visitor for the same answer.
 *
 * Order, first match wins:
 *   1. the NEXT_LOCALE cookie (an explicit choice from the EN/TR switch)
 *   2. the browser's preferred language is Turkish
 *   3. the device is on Turkish time
 *   4. English
 */

export const LOCALES = ["en", "tr"] as const;

/**
 * The web is English only (Canberk, 2026-11-03). The Turkish UI lives in Ghost
 * Light, where a Turkish actor brings their own script and rehearses it; the
 * web's monologue library is for English-speaking actors. With this off every
 * visitor resolves to English (a saved "tr" cookie included) and the EN/TR
 * switch is not drawn. The Turkish strings and the rules below are kept, so
 * turning it back on is this one line.
 */
export const TURKISH_ON_WEB = false;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function readLocaleCookie(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return isLocale(value) ? value : null;
    }
  }
  return null;
}

export function detectLocale(signals: {
  cookie?: string | null;
  languages?: readonly string[] | null;
  timeZone?: string | null;
}): Locale {
  return TURKISH_ON_WEB ? pickLocale(signals) : DEFAULT_LOCALE;
}

/** The order above, for when the web has Turkish on. */
export function pickLocale({
  cookie,
  languages,
  timeZone,
}: {
  cookie?: string | null;
  languages?: readonly string[] | null;
  timeZone?: string | null;
}): Locale {
  const chosen = readLocaleCookie(cookie);
  if (chosen) return chosen;

  // Only the first language counts. Almost every browser lists English
  // somewhere, and a Turkish speaker abroad with an English-first browser
  // still has the switch.
  const primary = languages?.[0]?.toLowerCase();
  if (primary && (primary === "tr" || primary.startsWith("tr-"))) return "tr";

  if (timeZone === "Europe/Istanbul" || timeZone === "Asia/Istanbul") return "tr";

  return DEFAULT_LOCALE;
}

/** A year. Path=/ so every page, the auth pages included, reads the same choice. */
export function localeCookieString(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
