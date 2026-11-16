/**
 * The brand in one place: the name people see, the site's address, and the
 * address they write to. ActorRise became Ghost Light (Canberk,
 * 2026-11-16, domain ghostlight.actor; actorrise.com 301-redirects here).
 *
 * Not brand, so never read from here: the API host (api.actorrise.com, which
 * every installed app calls and which stays), the `X-ActorRise-Locale` header,
 * cookie and storage keys, analytics event names. Renaming those breaks
 * clients that are already out there.
 */
export const BRAND = {
  /** The product's name, as written in a sentence. */
  name: "Ghost Light",
  /** Production site, no trailing slash. NEXT_PUBLIC_SITE_URL wins when set. */
  siteUrl: "https://ghostlight.actor",
  /** The address as printed for people to type, without https or www. */
  domain: "ghostlight.actor",
  /** Where actors and teachers write to me. Stays on actorrise.com until email
   *  moves to the new domain (warmed up, the old address still forwarding). */
  email: "canberk@actorrise.com",
} as const;

/** The site's base URL: the env when set (previews, local), else production. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl;
