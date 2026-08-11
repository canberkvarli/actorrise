"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { claimSignupTracked, trackSignupCompleted } from "@/lib/analytics";

/**
 * Fires signup_completed once per new account, whatever the signup method.
 *
 * It used to fire from SignupForm only, i.e. the email+password path. In the 14
 * days to 2026-08-11 that path was used by 0 of 101 new accounts — everyone
 * arrives through OAuth, whose callback is a server route that cannot call
 * gtag. GA4 therefore recorded 1 signup where the database recorded 28, and
 * every conversion rate anchored to signup_completed was wrong at the top.
 *
 * Firing here, from inside the authenticated shell, catches both paths with one
 * code path and no double-count.
 *
 * "New" needs two conditions, because neither is sufficient alone:
 *   - has_seen_welcome === false marks a fresh account, but 16 old users have
 *     never completed the welcome flow and would look new on every visit.
 *   - created_at within the window bounds it to an actual recent signup.
 * The localStorage claim then makes it once-per-account regardless.
 */

/** How recently the account must have been created to count as a signup. */
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

export function SignupTracker() {
  const { user, loading, isDemoUser } = useAuth();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || loading || !user || isDemoUser) return;

    // Must be explicitly false. A stale cached user missing the field is
    // undefined, and guessing on undefined is how you invent signups.
    if (user.has_seen_welcome !== false) return;
    if (!user.created_at) return;

    const age = Date.now() - new Date(user.created_at).getTime();
    if (!Number.isFinite(age) || age < 0 || age > FRESH_WINDOW_MS) return;

    if (!claimSignupTracked(user.id)) {
      firedRef.current = true;
      return;
    }
    firedRef.current = true;

    // The OAuth callback preserves ?provider= on the redirect, so on the landing
    // navigation we can still say which button they pressed.
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider") || undefined;

    trackSignupCompleted({
      source: window.location.pathname,
      method: provider ? "oauth" : "password",
      provider,
    });
  }, [user, loading, isDemoUser]);

  return null;
}
