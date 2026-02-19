import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * IMSDb direct script URL: https://imsdb.com/scripts/Breaking-Bad.html
 * If the script isn't on IMSDb the page will be empty — pair with a Google fallback button.
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

/** Google fallback — use when IMSDb search returns nothing. */
export function getScriptSearchUrl(title: string): string {
  const query = `${title.trim()} screenplay script`
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}
