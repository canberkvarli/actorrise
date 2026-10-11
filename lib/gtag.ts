const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    gtag?: (
      command: "config" | "event" | "js" | "set",
      targetId: string,
      config?: Record<string, unknown>
    ) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Sends exactly one page_view.
 *
 * This used to call gtag("config", ...) again on every route change. That is the
 * legacy pattern and it re-runs the whole config, which is why the tag was firing
 * twice: the inline <Script> in app/layout.tsx already ran config once (and a bare
 * config auto-sends a page_view), then this ran it a second time on mount. GA4 saw
 * two page_views, two session_starts and two first_visits per user, so every event
 * and pageview count in the property was ~2x. The config call now passes
 * send_page_view: false and this is the only thing that emits page_view.
 */
export function pageview(url: string) {
  if (typeof window === "undefined" || !window.gtag || !GA_MEASUREMENT_ID) return;
  window.gtag("event", "page_view", {
    page_path: url,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function event(
  action: string,
  params?: { event_category?: string; event_label?: string; value?: number }
) {
  if (typeof window === "undefined" || !window.gtag || !GA_MEASUREMENT_ID) return;
  window.gtag("event", action, params);
}

/**
 * Marks this browser's GA4 user as staff or not, as a user property. The
 * admin dashboards already leave staff out (users.exclude_from_stats); GA4 had
 * no such flag, so Canberk and the test accounts were inside every page-view
 * count, which on a quiet feature like /auditions was most of the number
 * (2026-10-12: "dont count me as the testers and my main account"). The
 * property reaches reports only once it is registered in GA4 Admin as a
 * user-scoped custom dimension named `staff`; until then it is carried and
 * ignored. Set on every login state change, including "no", so a shared
 * machine does not stay flagged after a staff logout.
 */
export function setStaff(staff: boolean) {
  if (typeof window === "undefined" || !window.gtag || !GA_MEASUREMENT_ID) return;
  window.gtag("set", "user_properties", { staff: staff ? "yes" : "no" });
}

export { GA_MEASUREMENT_ID };
