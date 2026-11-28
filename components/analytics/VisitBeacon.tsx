"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { trackEvent } from "@/lib/events";
import { referrerHost } from "@/lib/referrerHost";

const KEY = "gl_visit_day";
const TOUCH = /^[a-z0-9_]{1,32}$/;
const UTM = /^[\w.\-]{1,48}$/;

/** Today in the browser's own calendar, YYYY-MM-DD. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * What brought a signed-in person in today: visit_started, once a day.
 *
 * Canberk, 2026-11-28: of 516 free people in 30 days, 446 came on one day only.
 * The second day is the leak, and nothing said what brought back the ones who
 * did come back. This records it: an email's ?e= touch, utm tags, the other
 * site's host (never the URL), and the first path segment they landed on.
 *
 * The touch is read on the first render, before EmailClickBeacon takes ?e= off
 * the URL. The server keeps one a day per person too (api/events.py).
 */
export function VisitBeacon() {
  const { user, loading, isDemoUser } = useAuth();
  const params = useSearchParams();
  const first = useRef({ touch: params.get("e"), search: params.toString() });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || loading || !user || isDemoUser) return;
    fired.current = true;
    const day = today();
    try {
      if (window.localStorage.getItem(KEY) === day) return;
      window.localStorage.setItem(KEY, day);
    } catch {
      /* private mode: the server's own once-a-day check still holds */
    }
    const p = new URLSearchParams(first.current.search);
    const utm = (k: string) => {
      const v = p.get(k);
      return v && UTM.test(v) ? v : undefined;
    };
    const touch = first.current.touch;
    trackEvent("visit_started", {
      touch: touch && TOUCH.test(touch) ? touch : undefined,
      utm_source: utm("utm_source"),
      utm_medium: utm("utm_medium"),
      utm_campaign: utm("utm_campaign"),
      referrer: referrerHost(document.referrer, window.location.hostname) ?? undefined,
      landing: "/" + (window.location.pathname.split("/")[1] ?? ""),
    });
  }, [user, loading, isDemoUser]);

  return null;
}
