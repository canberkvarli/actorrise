"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { hasSeenTourThisSession } from "@/components/onboarding/TourSpotlight";

/**
 * "Onboarding finished in this tab", set by the first-run card on every exit it
 * has: finishing the questions, and skipping.
 *
 * The server flag is the truth, but the client only learns about it through a
 * background refreshUser() that the flow does not await. Tours gate on the
 * in-memory user, so a slow or failed refresh silently costs the actor every
 * tour for the rest of the visit, and clicking through to another page does not
 * fix it because a client-side navigation reuses the same user object.
 */
const ONBOARDING_LATCH = "actorrise_onboarding_done";

export function markOnboardingDone() {
  try {
    sessionStorage.setItem(ONBOARDING_LATCH, "1");
  } catch {
    /* sessionStorage unavailable — the server flag still covers the normal case */
  }
}

function onboardingDoneThisSession(): boolean {
  try {
    return sessionStorage.getItem(ONBOARDING_LATCH) === "1";
  } catch {
    return false;
  }
}

/**
 * Decides whether a surface's tour should run, and closes it once.
 *
 * Every tour page was doing this by hand, and each copy got it slightly
 * differently: the search tour waited for onboarding to finish, the profile
 * tour did not. Worse, they all keyed the effect on `user` alone, so the
 * refreshUser() that follows a dismissal could hand back a user whose flag had
 * not landed yet and the whole tour ran a second time.
 *
 * Three gates, all of them necessary:
 *  - the server flag, which is the durable record across visits
 *  - the session latch, which covers the window where the flag is in flight
 *  - `has_completed_onboarding`, so no tour ever stacks on the first-run card
 */
export function useTourTrigger(
  flag: "has_seen_search_tour" | "has_seen_profile_tour" | "has_seen_collection_tour",
  opts?: { delay?: number },
) {
  const { user, refreshUser } = useAuth();
  const [show, setShow] = useState(false);
  const [closed, setClosed] = useState(false);

  const delay = opts?.delay ?? 700;

  useEffect(() => {
    if (closed || !user) return;
    // Either the server says onboarding is done, or this session just finished
    // (or skipped) it. Both, because `user` here can be stale: the flow closes
    // and refreshes in the background, and if that refresh is slow or fails the
    // in-memory user keeps has_completed_onboarding === false for the rest of
    // the visit. A client-side navigation does not re-fetch it either — which
    // is exactly how skipping onboarding led to no tour on ScenePartner AND no
    // tour on search afterwards.
    if (user.has_completed_onboarding !== true && !onboardingDoneThisSession()) return;
    // `=== false`, not `!== true`: an absent field means the API does not serve
    // this flag yet (a tour whose column has not been migrated), and the right
    // answer there is to stay quiet rather than show the tour on every load.
    if ((user as unknown as Record<string, unknown>)[flag] !== false) return;
    if (hasSeenTourThisSession(flag)) return;

    // A beat, so the page has laid out and the anchors exist to be measured.
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [user, flag, delay, closed]);

  const dismiss = useCallback(async () => {
    setShow(false);
    setClosed(true);
    await refreshUser();
  }, [refreshUser]);

  return { show, dismiss };
}
