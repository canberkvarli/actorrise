import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** IMSDb search URL — surfaces only scripts that actually exist on IMSDb. */
export function getImsdbSearchUrl(title: string): string {
  return `https://imsdb.com/search/?q=${encodeURIComponent(title.trim())}`
}

/** Google fallback — use when IMSDb search returns nothing. */
export function getScriptSearchUrl(title: string): string {
  const query = `${title.trim()} screenplay script`
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}
