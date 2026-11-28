/** Another site's host, or null for none or our own. Never the full URL. */
export function referrerHost(referrer: string, ownHost: string): string | null {
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host && host !== ownHost.replace(/^www\./, "") ? host.slice(0, 64) : null;
  } catch {
    return null;
  }
}
