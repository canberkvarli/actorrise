"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconX } from "@tabler/icons-react";
import { useSubscription } from "@/hooks/useSubscription";
import {
  trackTrialOfferShown,
  trackTrialOfferDismissed,
  type TrialOfferTrigger,
} from "@/lib/analytics";

/**
 * The success-triggered trial offer.
 *
 * Every other trial CTA in the app is defensive: UpgradeModal only ever opens
 * because a gate said no. As of 2026-08-10 four users in the product's history
 * had ever hit a cap, so in practice the offer was never made at all. That is
 * the mechanical reason trial signups were zero, not the price.
 *
 * These fire on the way up instead: an actor just finished a scene, or spoke
 * enough lines to be visibly in it, or got their own script extracted. The last
 * of those is the strongest buy signal in the database by a wide margin (of the
 * ten people who ever uploaded a script, five paid).
 *
 * Rules this must never break:
 *   - Never interrupt a scene in progress. Mid-scene is a dismissible strip,
 *     never a modal.
 *   - Never nag. Capped per-actor below, and dismissal is respected for days.
 *   - Never shown to someone already paying or already trialing.
 */

const STORE_KEY = "actorrise_trial_offer";
/** Stop asking after this many shows, however they ended. */
const MAX_LIFETIME_SHOWS = 4;
/** Quiet period after any show, so two triggers in one session can't stack. */
const COOLDOWN_MS = 48 * 60 * 60 * 1000;
/** A dismissal is a clearer "not now" than a scroll-past, so it costs more. */
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

type OfferState = {
  shows: number;
  lastShownAt: number;
  quietUntil: number;
  /** Set once they click through. They are in the flow; stop asking. */
  clicked: boolean;
};

const EMPTY: OfferState = { shows: 0, lastShownAt: 0, quietUntil: 0, clicked: false };

function readState(): OfferState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeState(next: Partial<OfferState>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...readState(), ...next }));
  } catch {
    /* private mode — worst case the cap resets, which is survivable */
  }
}

export function checkoutHref(trigger: TrialOfferTrigger) {
  return `/checkout?tier=plus&period=monthly&trial=1&from=${trigger}`;
}

/**
 * Decides whether this actor should see an offer right now, and records it.
 *
 * `active` is the caller's own condition (scene finished, Nth line delivered,
 * upload succeeded). Eligibility is evaluated once when that flips true, so a
 * re-render can never re-open something the actor just closed.
 */
export function useTrialOffer(trigger: TrialOfferTrigger, active: boolean) {
  const { subscription, isLoading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  // Snapshotted once at mount, deliberately. Reading the cap fresh on every
  // render would let a show recorded below immediately disqualify itself, and
  // the whole decision wants to be stable for the life of the screen anyway.
  const [snapshot] = useState(() => ({ state: readState(), now: Date.now() }));

  const tier = subscription?.tier_name ?? "free";
  // A trialing user already has a card on file. Asking again is noise.
  const isFree = tier === "free" && subscription?.status !== "trialing";

  const eligible =
    !isLoading &&
    isFree &&
    !snapshot.state.clicked &&
    snapshot.state.shows < MAX_LIFETIME_SHOWS &&
    snapshot.now >= snapshot.state.quietUntil &&
    snapshot.now - snapshot.state.lastShownAt >= COOLDOWN_MS;

  // Derived, never set from an effect: the effect below only records that it
  // happened, which keeps the render path honest about what drives the UI.
  const visible = active && eligible && !dismissed;

  const recordedRef = useRef(false);
  useEffect(() => {
    if (!visible || recordedRef.current) return;
    recordedRef.current = true;
    writeState({ shows: readState().shows + 1, lastShownAt: Date.now() });
    trackTrialOfferShown({ trigger, tier_current: tier });
  }, [visible, trigger, tier]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeState({ quietUntil: Date.now() + DISMISS_COOLDOWN_MS });
    trackTrialOfferDismissed({ trigger, tier_current: tier });
  }, [trigger, tier]);

  const accept = useCallback(() => {
    writeState({ clicked: true });
  }, []);

  const href = useMemo(() => checkoutHref(trigger), [trigger]);

  return { visible, dismiss, accept, href };
}

/* ── Presentations ───────────────────────────────────────────────── */

interface CardProps {
  headline: string;
  body: string;
  cta?: string;
  href: string;
  onAccept: () => void;
  onDismiss: () => void;
  /** The review screen is on the dark stage background; /practice is on light. */
  tone?: "dark" | "light";
}

/**
 * The full-attention version, for a moment that has already stopped: the scene
 * review screen, or the panel after a script finishes extracting.
 */
export function TrialOfferCard({
  headline,
  body,
  cta = "Start 2 weeks free",
  href,
  onAccept,
  onDismiss,
  tone = "dark",
}: CardProps) {
  const dark = tone === "dark";
  return (
    <div
      className={
        dark
          ? "relative rounded-lg border border-[#CB4B00]/30 bg-[#CB4B00]/10 p-5 text-center space-y-3"
          : "relative rounded-lg border border-[#CB4B00]/25 bg-[#CB4B00]/5 p-5 text-center space-y-3"
      }
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className={`absolute right-2 top-2 p-1 transition-opacity hover:opacity-100 ${
          dark ? "text-neutral-500 opacity-70" : "text-muted-foreground opacity-60"
        }`}
      >
        <IconX className="h-4 w-4" />
      </button>

      <p className={`text-base font-semibold ${dark ? "text-neutral-100" : "text-foreground"}`}>
        {headline}
      </p>
      <p className={`text-sm ${dark ? "text-neutral-400" : "text-muted-foreground"}`}>{body}</p>
      <Button asChild className="bg-[#CB4B00] text-white hover:bg-[#B03000]">
        <Link href={href} onClick={onAccept}>
          {cta}
        </Link>
      </Button>
      <p className={`text-xs ${dark ? "text-neutral-500" : "text-muted-foreground"}`}>
        $0 today, cancel anytime before it renews.
      </p>
    </div>
  );
}

/**
 * The mid-scene version. Deliberately a quiet strip pinned out of the reading
 * path, because the one thing worse than not asking is interrupting an actor
 * who is finally saying their lines.
 */
export function TrialOfferBanner({
  body,
  href,
  onAccept,
  onDismiss,
}: {
  body: string;
  href: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[10040] w-[min(92vw,30rem)] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-lg border border-[#CB4B00]/40 bg-[#191410]/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="flex-1 text-sm text-neutral-300">{body}</p>
        <Button
          asChild
          size="sm"
          className="shrink-0 bg-[#CB4B00] text-white hover:bg-[#B03000]"
        >
          <Link href={href} onClick={onAccept}>
            2 weeks free
          </Link>
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Not now"
          className="shrink-0 p-1 text-neutral-500 hover:text-neutral-300"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
