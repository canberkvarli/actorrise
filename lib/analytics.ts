/**
 * GA4 custom event tracking for ActorRise.
 *
 * Wraps window.gtag with type-safe helpers so we never call gtag directly
 * from components. All helpers are SSR-safe (guarded with typeof window).
 */

// ─── Event param types ───────────────────────────────────────────────

type SearchPerformedParams = {
  query: string;
  results_count: number;
  search_type: "monologue" | "film_tv";
};

type SecondSearchPerformedParams = SearchPerformedParams & {
  search_count: number;
};

type ResultClickedParams = {
  monologue_id: number;
  title: string;
  position: number;
  search_type: "monologue" | "film_tv";
};

type ScenePartnerOpenedParams = {
  source: "search_result" | "nav" | "direct";
};

type SignupCompletedParams = {
  source: string;
  /**
   * How they actually signed up. This existed only on the email+password form,
   * which in the 14 days to 2026-08-11 was used by 0 of 101 new accounts — so
   * GA4 recorded 1 signup against the database's 28 and every rate built on it
   * was wrong.
   */
  method?: "oauth" | "password";
  provider?: string;
};

type MonologueSavedParams = {
  monologue_id: number;
  title: string;
};

/** Which surface a rehearsal ran on. Keeps scene/monologue/greenroom comparable. */
type RehearsalMode = "scene" | "monologue" | "greenroom";

type RehearsalStartedParams = {
  mode: RehearsalMode;
  scene_id?: number | string;
  script_id?: number | string;
  /** True the first time this browser ever starts a rehearsal. The activation moment. */
  is_first_ever: boolean;
  cold_read?: boolean;
  /**
   * Mic permission as the scene actually opens. 39% of all sessions ever run
   * delivered zero lines, and this is the difference between "the mic was never
   * granted" and "they had a working mic and still said nothing", which are
   * completely different products to fix.
   */
  mic_status?: "granted" | "prompt" | "denied" | "unavailable" | "unknown";
};

type RehearsalLineDeliveredParams = {
  mode: RehearsalMode;
  /** Seconds from the run screen loading to the actor's first spoken line. */
  seconds_to_first_line: number;
};

type RehearsalCompletedParams = {
  mode: RehearsalMode;
  duration_seconds: number;
  lines_total: number;
};

type RehearsalAbandonedParams = {
  mode: RehearsalMode;
  /** 0-100. Where the run died, which is the number the activation work needs. */
  progress_pct: number;
  last_line_index: number;
  duration_seconds: number;
};

type UpgradeModalViewedParams = {
  /** The gate that blocked them. Tells us which wall makes actors reach for a card. */
  feature: string;
  tier_current: string;
};

/**
 * Where a success-triggered trial offer was shown. Distinct from
 * upgrade_modal_viewed, which is always a denial: an actor hit a wall and the
 * product said no. These fire when the product just worked, which is the only
 * moment anyone has ever put a card down.
 */
export type TrialOfferTrigger =
  | "scene_completed"
  | "lines_delivered"
  | "script_uploaded";

type TrialOfferShownParams = {
  trigger: TrialOfferTrigger;
  tier_current: string;
};

type TrialOfferDismissedParams = TrialOfferShownParams;

type BeginCheckoutParams = {
  tier: string;
  billing_period: string;
  trial: boolean;
  /** Where the upgrade started: an upsell modal, /pricing, /billing, an email. */
  entry_point: string;
  value?: number;
  currency?: string;
};

// ─── Low-level gtag wrapper ──────────────────────────────────────────

function sendEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}

// ─── Session search counter ──────────────────────────────────────────

const SESSION_SEARCH_COUNT_KEY = "ga_session_search_count";

function getSessionSearchCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    return parseInt(sessionStorage.getItem(SESSION_SEARCH_COUNT_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function incrementSessionSearchCount(): number {
  const next = getSessionSearchCount() + 1;
  try {
    sessionStorage.setItem(SESSION_SEARCH_COUNT_KEY, String(next));
  } catch {
    // ignore
  }
  return next;
}

// ─── Public tracking helpers ─────────────────────────────────────────

export function trackSearchPerformed(params: SearchPerformedParams) {
  const searchCount = incrementSessionSearchCount();

  sendEvent("search_performed", {
    query: params.query,
    results_count: params.results_count,
    search_type: params.search_type,
  });

  if (searchCount > 1) {
    sendEvent("second_search_performed", {
      query: params.query,
      results_count: params.results_count,
      search_type: params.search_type,
      search_count: searchCount,
    } satisfies SecondSearchPerformedParams);
  }
}

export function trackResultClicked(params: ResultClickedParams) {
  sendEvent("result_clicked", params);
}

export function trackScenePartnerOpened(params: ScenePartnerOpenedParams) {
  sendEvent("scenepartner_opened", params);
}

const SIGNUP_TRACKED_PREFIX = "actorrise_signup_tracked:";

/**
 * True at most once per account per browser.
 *
 * Keyed on user id rather than a single flag so a shared machine cannot swallow
 * the second person's signup.
 */
export function claimSignupTracked(userId: number | string): boolean {
  if (typeof window === "undefined") return false;
  const key = `${SIGNUP_TRACKED_PREFIX}${userId}`;
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
    return true;
  } catch {
    // Private mode: better to miss the event than to fire it on every page load.
    return false;
  }
}

export function trackSignupCompleted(params: SignupCompletedParams) {
  sendEvent("signup_completed", params);
}

export function trackMonologueSaved(params: MonologueSavedParams) {
  sendEvent("monologue_saved", params);
}

// ─── Rehearsal ───────────────────────────────────────────────────────
//
// Until these existed the only signal that anyone rehearsed was a pageview on
// /rehearse, which cannot tell you whether they pressed play or quit at line
// three. progress_pct on abandon is the one that locates the cliff.

const FIRST_REHEARSAL_KEY = "actorrise_has_rehearsed";

/** True once per browser, the first time a rehearsal ever starts. */
function claimFirstRehearsal(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(FIRST_REHEARSAL_KEY)) return false;
    localStorage.setItem(FIRST_REHEARSAL_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function trackRehearsalStarted(params: Omit<RehearsalStartedParams, "is_first_ever">) {
  sendEvent("rehearsal_started", {
    ...params,
    is_first_ever: claimFirstRehearsal(),
  } satisfies RehearsalStartedParams);
}

export function trackRehearsalLineDelivered(params: RehearsalLineDeliveredParams) {
  sendEvent("rehearsal_line_delivered", params);
}

export function trackRehearsalCompleted(params: RehearsalCompletedParams) {
  sendEvent("rehearsal_completed", params);
}

export function trackRehearsalAbandoned(params: RehearsalAbandonedParams) {
  sendEvent("rehearsal_abandoned", params);
}

// ─── Money path ──────────────────────────────────────────────────────
//
// trial_started and trial_converted deliberately do NOT live here. Client-side
// purchase events get eaten by ad blockers and lost across the Stripe redirect,
// so those fire server-side from the webhook via the Measurement Protocol
// (backend/app/services/analytics/ga4.py).

export function trackUpgradeModalViewed(params: UpgradeModalViewedParams) {
  sendEvent("upgrade_modal_viewed", params);
}

export function trackTrialOfferShown(params: TrialOfferShownParams) {
  sendEvent("trial_offer_shown", params);
}

export function trackTrialOfferDismissed(params: TrialOfferDismissedParams) {
  sendEvent("trial_offer_dismissed", params);
}

export function trackBeginCheckout(params: BeginCheckoutParams) {
  sendEvent("begin_checkout", {
    currency: "USD",
    ...params,
  });
}

/**
 * The GA4 client id, pulled out of the `_ga` cookie.
 *
 * The cookie looks like `GA1.1.1234567890.1700000000` and GA4 wants only the
 * last two parts. Sent along with checkout so the Stripe webhook can fire
 * trial_started against the same GA4 user who searched and signed up. Without
 * it every trial looks like a brand new visitor with no history, and the funnel
 * breaks exactly where it matters most.
 *
 * Returns null when GA has not set a cookie yet, or an ad blocker removed it.
 */
export function getGaClientId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/);
  if (!match) return null;
  const parts = match[1].split(".");
  return parts.length >= 4 ? parts.slice(-2).join(".") : null;
}
