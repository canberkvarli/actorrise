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
};

type MonologueSavedParams = {
  monologue_id: number;
  title: string;
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

export function trackSignupCompleted(params: SignupCompletedParams) {
  sendEvent("signup_completed", params);
}

export function trackMonologueSaved(params: MonologueSavedParams) {
  sendEvent("monologue_saved", params);
}
