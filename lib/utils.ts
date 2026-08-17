import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * IMSDb direct script URL: https://imsdb.com/scripts/Breaking-Bad.html
 * If the script isn't on IMSDb the page will be empty; pair with a Google fallback button.
 */
export function getImsdbSearchUrl(title: string): string {
  const slug = title
    .trim()
    .replace(/['']/g, "")
    .replace(/\s*&\s*/g, "-and-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
  return `https://imsdb.com/scripts/${slug}.html`
}

/**
 * Script Slug script URL: https://www.scriptslug.com/script/[title-slug]-[year]
 * Format: lowercase title with spaces → hyphens, then -year (e.g. "Blue Moon" 2025 → blue-moon-2025).
 */
export function getScriptSlugUrl(title: string, year: number | null): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s*&\s*/g, "-and-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  const path = year != null ? `${slug}-${year}` : slug
  return `https://www.scriptslug.com/script/${path}`
}

/** Google fallback: use when IMSDb search returns nothing. */
export function getScriptSearchUrl(title: string): string {
  const query = `${title.trim()} screenplay script`
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

/**
 * Script URL for a Film/TV reference. Uses stored imsdb_url override when set,
 * otherwise builds IMSDb URL from title (e.g. for "The Godfather" → Godfather on IMSDb, admin can set override).
 */
export function getFilmTvScriptUrl(ref: { imsdb_url?: string | null; title: string }): string {
  if (ref.imsdb_url?.trim()) return ref.imsdb_url.trim()
  return getImsdbSearchUrl(ref.title)
}

/**
 * Whether to show the monologue title in the UI. Hides generic noise like "Dr's Monologue" or "Someone's Monologue".
 */
/**
 * True when a monologue title says something the card is not already showing.
 *
 * Most titles are machine-generated from the fields printed directly above and
 * below them, so rendering them repeats the same words three times: the Fleabag
 * card read "Fleabag / Fleabag / Fleabag, Fleabag / Fleabag". Measured on the
 * live catalogue: 100% of TV titles are exactly "{character}, {show}" (2,176 of
 * 2,176) and 87.8% of play titles are "{character}'s speech from {play}" (7,661
 * of 8,724). Film is the counter-example and the standard to aim at, with real
 * titles like "Brick Top's Pig Speech", 0% redundant.
 *
 * Pass playTitle wherever it is available, or the two dominant patterns cannot
 * be detected at all.
 */
export function isMeaningfulMonologueTitle(
  title: string | null | undefined,
  characterName?: string,
  playTitle?: string | null
): boolean {
  const t = title?.trim()
  if (!t) return false

  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ")
  const lower = norm(t)
  const char = characterName ? norm(characterName) : ""
  const play = playTitle ? norm(playTitle) : ""

  if (/^monologue$/i.test(t)) return false
  if (/'s\s+monologue$/i.test(t)) return false
  if (char && lower === `${char}'s monologue`) return false
  // The title IS the character, or the character and the play glued together.
  if (char && lower === char) return false
  if (char && play && lower === `${char}, ${play}`) return false
  // "Waspe's speech from Bartholomew Fair" — both halves already on the card.
  if (char && play && lower === `${char}'s speech from ${play}`) return false
  if (char && play && lower === `${char}s speech from ${play}`) return false
  // Same shape with any possessive form, e.g. "Jere's speech from X".
  if (char && play && new RegExp(`^${escapeRe(char)}['’]?s? speech from ${escapeRe(play)}$`).test(lower)) return false
  if (play && lower === play) return false
  return true
}

function escapeRe(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** An author string worth printing. "Unknown" on the card is worse than silence. */
export function displayableAuthor(author: string | null | undefined): string | null {
  const a = author?.trim()
  if (!a) return null
  if (/^(unknown|n\/?a|various|anonymous|uncredited)$/i.test(a)) return null
  return a
}
