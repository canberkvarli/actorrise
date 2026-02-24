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
export function isMeaningfulMonologueTitle(
  title: string | null | undefined,
  characterName?: string
): boolean {
  const t = title?.trim()
  if (!t) return false
  if (/^monologue$/i.test(t)) return false
  if (/'s\s+monologue$/i.test(t)) return false
  if (characterName && t.toLowerCase() === `${characterName.trim().toLowerCase()}'s monologue`) return false
  return true
}
