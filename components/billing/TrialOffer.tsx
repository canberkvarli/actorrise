"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { IconX } from "@tabler/icons-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import {
  trackPaywallCtaClicked,
  trackTrialOfferShown,
  trackTrialOfferDismissed,
  type TrialOfferTrigger,
} from "@/lib/analytics";
import {
  canShow,
  EMPTY_STORE,
  parseStore,
  recordClick,
  recordDismiss,
  recordShow,
  type Store,
} from "@/lib/paywall/eligibility";
import { claim, holder, release, subscribe } from "@/lib/paywall/slot";

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
 *   - Never nag. Each gate is capped and cooled on its own
 *     (lib/paywall/eligibility.ts), and three dismissals end it for the session.
 *   - Never two at once (lib/paywall/slot.ts).
 *   - Never shown to someone already paying or already trialing.
 */

// v2: per gate. The v1 key held one counter for every trigger and is left to
// go stale unread.
const STORE_KEY = "actorrise_paywall_v2";
const SESSION_DISMISSALS_KEY = "actorrise_paywall_dismissals";

function readStore(): Store {
  if (typeof window === "undefined") return EMPTY_STORE;
  try {
    return parseStore(localStorage.getItem(STORE_KEY));
  } catch {
    return EMPTY_STORE;
  }
}

function writeStore(next: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* private mode — worst case the caps reset, which is survivable */
  }
}

function readSessionDismissals(): number {
  if (typeof window === "undefined") return 0;
  try {
    return parseInt(sessionStorage.getItem(SESSION_DISMISSALS_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function addSessionDismissal() {
  try {
    sessionStorage.setItem(SESSION_DISMISSALS_KEY, String(readSessionDismissals() + 1));
  } catch {
    /* ignore */
  }
}

export function checkoutHref(trigger: TrialOfferTrigger) {
  return `/checkout?tier=plus&period=monthly&trial=1&from=${trigger}`;
}

/**
 * Decides whether this actor should see an offer right now, and records it.
 *
 * `active` is the caller's own condition (scene finished, Nth line delivered,
 * third piece saved). `variant` names the wording shown, for paywall_hit.
 *
 * Eligibility is read once, when the hook mounts. A caller whose moment comes
 * long after its page loaded (the third save, the reads meter) mounts the hook
 * at that moment instead of at page load, so what it reads is current.
 */
export function useTrialOffer(trigger: TrialOfferTrigger, active: boolean, variant?: string) {
  const { subscription, isLoading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  // Snapshotted once at mount, deliberately. Reading the cap fresh on every
  // render would let a show recorded below immediately disqualify itself, and
  // the whole decision wants to be stable for the life of the screen anyway.
  const [snapshot] = useState(() => ({
    store: readStore(),
    now: Date.now(),
    sessionDismissals: readSessionDismissals(),
  }));

  const tier = subscription?.tier_name ?? "free";
  // A trialing user already has a card on file. Asking again is noise.
  const isFree = tier === "free" && subscription?.status !== "trialing";

  const eligible =
    !isLoading &&
    isFree &&
    canShow(snapshot.store, trigger, snapshot.now, snapshot.sessionDismissals);

  const wanted = active && eligible && !dismissed;

  // One ask on screen at a time. Wanting the screen and holding it are two
  // things: the claim is made in an effect, and who holds it is read back
  // through the store, so nothing here sets state to find out.
  const holding = useSyncExternalStore(subscribe, holder, () => null);
  const held = holding === trigger;
  // Claims again whenever the slot changes hands, so an ask that had to wait
  // takes the screen once the one before it lets go.
  useEffect(() => {
    if (wanted) claim(trigger);
  }, [wanted, trigger, holding]);
  // Letting go is its own effect: tied to wanting it, not to who holds it.
  useEffect(() => {
    if (!wanted) return;
    return () => release(trigger);
  }, [wanted, trigger]);

  // Derived, never set from an effect: the effect below only records that it
  // happened, which keeps the render path honest about what drives the UI.
  const visible = wanted && held;

  const recordedRef = useRef(false);
  useEffect(() => {
    if (!visible || recordedRef.current) return;
    recordedRef.current = true;
    writeStore(recordShow(readStore(), trigger, Date.now()));
    trackTrialOfferShown({ trigger, tier_current: tier, variant });
  }, [visible, trigger, tier, variant]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeStore(recordDismiss(readStore(), trigger, Date.now()));
    addSessionDismissal();
    trackTrialOfferDismissed({ trigger, tier_current: tier });
  }, [trigger, tier]);

  const accept = useCallback(() => {
    writeStore(recordClick(readStore()));
    trackPaywallCtaClicked(trigger, "ask", tier, variant);
  }, [trigger, tier, variant]);

  const href = useMemo(() => checkoutHref(trigger), [trigger]);

  return { visible, dismiss, accept, href };
}

/* ── Presentations ───────────────────────────────────────────────── */

interface CardProps {
  headline: string;
  body: string;
  /** Defaults to the trial this actor would get: "Start 1 week free", or 2. */
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
  cta,
  href,
  onAccept,
  onDismiss,
  tone = "dark",
}: CardProps) {
  const words = useTrialWords();
  return (
    /* theatre-tokens and the faces ride on the card: both hosts (scene review,
       the practice panel) bind neither, so without them every --t-* resolves
       to nothing and the font-family rules are dropped whole. */
    <div
      className={`t-offer theatre-tokens ${theatreFontVars}${
        tone === "dark" ? " t-offer--stage" : ""
      }`}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className="t-offer__x"
      >
        <IconX className="h-4 w-4" />
      </button>

      <p className="t-offer__dir">(an offer, while you have a moment.)</p>
      <p className="t-offer__title">{headline}</p>
      <p className="t-offer__body">{body}</p>

      <div className="t-offer__foot">
        <Link href={href} onClick={onAccept} className="t-offer__cta">
          {cta ?? words.cta}
        </Link>
      </div>

      <p className="t-offer__fine">$0 today, cancel any time before it renews.</p>
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
  aboveRunBar = false,
}: {
  body: string;
  href: string;
  onAccept: () => void;
  onDismiss: () => void;
  /**
   * The monologue page keeps "Rehearse this" in a bar at the foot of the
   * screen below lg (components/monologue/v2/RunBar.tsx). An ask must never
   * sit on the one button the page exists for, so there it rides above.
   */
  aboveRunBar?: boolean;
}) {
  const words = useTrialWords();
  // Whole class names, both of them: Tailwind cannot see a computed one.
  const foot = aboveRunBar
    ? "bottom-[calc(11rem+env(safe-area-inset-bottom,0px))] lg:bottom-4"
    : "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-4";
  return (
    <div /* bottom-4 put this behind the phone tab bar — the trial offer, the one
         strip in the product whose whole job is to be seen. Clears the bar on a
         phone and keeps its original inset from md up. */
      className={`pointer-events-auto fixed left-1/2 z-[10040] w-[min(92vw,30rem)] -translate-x-1/2 ${foot}`}>
      <div className={`t-strip theatre-tokens ${theatreFontVars}`}>
        <p className="t-strip__body">{body}</p>
        <Link href={href} onClick={onAccept} className="t-strip__cta shrink-0">
          {words.short}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Not now"
          className="t-offer__x shrink-0"
          style={{ position: "static" }}
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
