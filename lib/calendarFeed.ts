/**
 * One-tap subscribe links for the auditions calendar feed.
 *
 * The backend hands out an https URL to the ICS feed. Apple wants the same
 * URL on webcal:// (that is what makes Calendar offer to subscribe rather than
 * import once). Google takes the webcal URL as `cid`; Outlook takes the https
 * one as `url`. A subscription keeps itself up to date, an import never does.
 */

export type CalendarProvider = "google" | "apple" | "outlook";

export const CALENDAR_FEED_NAME = "ActorRise auditions";

/** https://… or http://… → webcal://… (anything already webcal stays as it is). */
export function webcalUrl(feed: string): string {
  return feed.replace(/^https?:\/\//i, "webcal://");
}

/** webcal://… → https://… for the providers that fetch it themselves. */
export function httpsUrl(feed: string): string {
  return feed.replace(/^webcal:\/\//i, "https://");
}

export function subscribeUrl(provider: CalendarProvider, feed: string): string {
  switch (provider) {
    case "apple":
      return webcalUrl(feed);
    case "google":
      return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(feed))}`;
    case "outlook":
      return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl(feed))}&name=${encodeURIComponent(CALENDAR_FEED_NAME)}`;
  }
}

/**
 * Was this the actor's first audition? Then the page they land on offers the
 * calendar once. sessionStorage, so a reload or a later visit never repeats it;
 * a throw (private mode) just means no offer.
 */
export const CALENDAR_OFFER_KEY = "aud-cal-offer";

type GetStorage = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;

const session: GetStorage = () => window.sessionStorage;

export function markCalendarOffer(id: number, storage: GetStorage = session): void {
  try {
    storage().setItem(CALENDAR_OFFER_KEY, String(id));
  } catch {
    /* no offer then */
  }
}

/** Reads the offer and clears it in the same breath, so it shows once. */
export function takeCalendarOffer(storage: GetStorage = session): number | null {
  try {
    const raw = storage().getItem(CALENDAR_OFFER_KEY);
    if (raw == null) return null;
    storage().removeItem(CALENDAR_OFFER_KEY);
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * webcal:// only does something on a Mac, an iPhone or an iPad, so the Apple
 * button shows there and nowhere else. Unknown (no navigator) counts as Apple:
 * the server render shows it and the client decides after mount.
 */
export function isApplePlatform(nav?: { userAgent?: string; platform?: string; userAgentData?: { platform?: string } }): boolean {
  if (!nav) return true;
  const hay = [nav.userAgentData?.platform, nav.platform, nav.userAgent].filter(Boolean).join(" ");
  if (!hay) return true;
  return /mac|iphone|ipad|ipod|\bios\b/i.test(hay);
}
