"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Zero-setup first rehearsal — the activation move.
 *
 * The product loses ~96% of users between "searched a monologue" and "rehearsed
 * a scene" because rehearsing lives on a separate island that needs a script
 * upload first. This gate closes that gap: once a user has finished onboarding
 * but has NEVER rehearsed, it sends them (once) straight to /first-scene, which
 * drops them into a pre-cast sample scene. Catches brand-new signups AND the
 * backlog of dormant-but-never-rehearsed accounts on their next visit.
 *
 * Renders nothing. Self-gates entirely on the auth user.
 */

// Routes we must never yank someone out of: an in-progress rehearsal/edit, the
// interstitial itself, or auth/checkout flows.
const SKIP_PREFIXES = ["/first-scene", "/checkout", "/billing", "/auth"];
const IMMERSIVE_RE =
  /^\/scenes\/[^/]+\/rehearse|^\/practice\/[^/]+\/scenes\/[^/]+\/edit/;

// Durable one-shot guard. The backend flag is the source of truth across
// sessions, but it propagates through a throttled /me refresh — so within a
// single session we also latch on sessionStorage to guarantee the gate fires
// at most once and can never bounce the user (e.g. after "Skip").
const SESSION_GUARD_KEY = "actorrise_first_scene_handled";

function alreadyHandledThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_GUARD_KEY) === "1";
  } catch {
    return false;
  }
}

function markHandledThisSession() {
  try {
    sessionStorage.setItem(SESSION_GUARD_KEY, "1");
  } catch {
    /* sessionStorage unavailable — fall back to the in-memory ref + backend flag */
  }
}

export function FirstRehearsalGate() {
  const { user, loading, isDemoUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (loading || !user || isDemoUser) return;
    if (alreadyHandledThisSession()) {
      firedRef.current = true;
      return;
    }

    // Only after onboarding is finished, so we never collide with the welcome
    // flow. has_ever_rehearsed must be an EXPLICIT false (fresh from /me) — a
    // stale localStorage user missing the field stays undefined and is ignored,
    // so we never wrongly funnel someone who already rehearsed.
    const eligible =
      user.has_completed_onboarding === true &&
      user.has_ever_rehearsed === false &&
      user.has_seen_first_rehearsal !== true;
    if (!eligible) return;

    const path = pathname || "";
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return;
    if (IMMERSIVE_RE.test(path)) return;

    firedRef.current = true;
    markHandledThisSession();
    router.push("/first-scene");
  }, [user, loading, isDemoUser, pathname, router]);

  return null;
}
