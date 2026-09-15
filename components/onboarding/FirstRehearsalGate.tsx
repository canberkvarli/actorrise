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
// has_ever_rehearsed only counts scene_partner sessions, so someone who just
// chose a monologue still reads as eligible. Without /monologue here the gate
// fired on arrival and yanked them straight back out of the thing they picked,
// at the exact moment a brand new actor had shown the most intent.
const IMMERSIVE_RE =
  /^\/scenes\/[^/]+\/rehearse|^\/practice\/[^/]+\/scenes\/[^/]+\/edit|^\/monologue\/[^/]+\/(work|memorize)/;

// Durable one-shot guard. The backend flag is the source of truth across
// sessions, but it propagates through a throttled /me refresh — so within a
// single session we also latch on sessionStorage to guarantee the gate fires
// at most once and can never bounce the user (e.g. after "Skip").
//
// OnboardingWizard latches this key the moment it MOUNTS, not when the gate
// fires — see MIN_ACCOUNT_AGE_MS below for why that matters.
const SESSION_GUARD_KEY = "actorrise_first_scene_handled";

// The gate is a permanently-mounted watcher on has_completed_onboarding, and
// the onboarding card is the thing that FLIPS that flag. So every exit from
// the card — "skip", "i'll explore on my own", "browse the library", "upload a
// script" — used to refreshUser(), trip this gate a beat later, and land the
// actor in /monologue/<whatever>/work. Four of the card's five doors opened
// into the same room, and two of them (browse/own-sides) pushed their own
// route first and had it overridden while the actor watched.
//
// The fix is not a longer SKIP_PREFIXES list, because the problem was never
// the path — it was the moment. This gate is for a RETURNING actor who has
// been around and never rehearsed. Someone in their first sitting has no
// "later visit" to interrupt; they are still being onboarded. Account age
// separates the two populations cleanly and, unlike sessionStorage, survives
// a closed tab. The ~265 dormant accounts this was built for are all months
// old and still qualify on their next visit.
const MIN_ACCOUNT_AGE_MS = 6 * 60 * 60 * 1000;

function isFirstSitting(createdAt: string | undefined): boolean {
  if (!createdAt) return false; // unknown age — don't invent a reason to skip
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return Date.now() - created < MIN_ACCOUNT_AGE_MS;
}

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
      user.has_seen_first_rehearsal !== true &&
      !isFirstSitting(user.created_at);
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
