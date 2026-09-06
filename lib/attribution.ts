/**
 * First-touch acquisition attribution.
 *
 * On the first page this browser ever loads we remember the utm_* tags and the
 * external referrer, and from then on lib/api.ts sends them on every request as
 * an `X-Attribution` header. The backend reads that header exactly once: when
 * it creates the users row (get_current_user). So the value that lands on the
 * account is where the visitor came from BEFORE they signed up, whichever
 * signup method they used, without threading anything through Supabase auth.
 *
 * First touch, never overwritten: a returning visitor who later clicks an
 * Instagram link keeps their original source. That is the marketing question
 * ("what brought them in"), and it is also what stops an existing user from
 * ever being re-attributed, since their row is already created.
 *
 * Signups went 76 -> 141 -> 143 a week over three weeks in 2026-08/09 and
 * nothing could say why. This is the missing column.
 */

const STORAGE_KEY = "ar_attribution_v1";

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
};

const KEYS: (keyof Attribution)[] = ["utm_source", "utm_medium", "utm_campaign", "referrer"];
const MAX_LEN = 512;

function clean(value: string | null | undefined): string | undefined {
  const v = (value ?? "").trim().slice(0, MAX_LEN);
  return v || undefined;
}

/** True when the referrer is one of our own pages (a client-side hop, not a source). */
function isSameSite(referrer: string): boolean {
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    const own = window.location.hostname.replace(/^www\./, "");
    return host === own;
  } catch {
    return false;
  }
}

/** Read what the current page says about where the visitor came from. */
function readFromPage(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const out: Attribution = {
    utm_source: clean(params.get("utm_source")),
    utm_medium: clean(params.get("utm_medium")),
    utm_campaign: clean(params.get("utm_campaign")),
  };
  const ref = clean(document.referrer);
  if (ref && !isSameSite(ref)) out.referrer = ref;
  return out;
}

/**
 * Remember the first touch if nothing is remembered yet. Safe to call on every
 * page load; it is a no-op once a value exists. Also stored when the visitor
 * arrived with nothing, so a later tagged visit cannot claim the first touch.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    const found = readFromPage();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(found));
  } catch {
    // Private mode / blocked storage: attribution is nice-to-have, never fatal.
  }
}

/** The stored first touch, or null when there is none or it is empty. */
export function getAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Attribution = {};
    for (const key of KEYS) {
      const v = parsed[key];
      if (typeof v === "string" && v) out[key] = v.slice(0, MAX_LEN);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Header value for lib/api.ts, or undefined when there is nothing to send. */
export function attributionHeader(): string | undefined {
  const attr = getAttribution();
  return attr ? JSON.stringify(attr) : undefined;
}
