"use client";

import { useEffect } from "react";

import { PlusOffer } from "@/components/billing/PlusOffer";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import { trackUpgradeModalViewed } from "@/lib/analytics";

/**
 * The end of the free reads, laid over the text that stops early.
 *
 * Inline and over the page, not a modal. The server returns a teaser rather
 * than the whole speech, so the actor is looking at a paragraph that simply
 * stops — and a modal can be dismissed, which leaves them staring at a
 * fragment with nothing on screen explaining why it ends there. The gate has
 * to live where the text ran out.
 *
 * The card leans and casts a gel shadow because it is a card someone put down
 * on the page, not a system banner welded to it.
 */
export function ReadGate({ feature = "monologue_read" }: { feature?: string }) {
  const { subscription } = useSubscription();
  const currentTier = subscription?.tier_name ?? "free";
  const words = useTrialWords();

  useEffect(() => {
    trackUpgradeModalViewed({ feature, tier_current: currentTier });
  }, [feature, currentTier]);

  return (
    /* The card carries the whole offer now and is taller than most teasers,
       so it sits in the flow under the text instead of over it; only the fade
       reaches back up over the last lines. */
    <div className="relative flex justify-center pb-2 pt-1">
      <div aria-hidden className="t-m__gatefade pointer-events-none absolute inset-x-0 bottom-full h-40" />
      <div
        className="t-m__hard-gel t-m-pop relative w-full max-w-[460px] -rotate-[0.8deg] rounded-lg border-[1.5px] px-[26px] py-6"
        style={{ borderColor: "var(--t-text)", background: "var(--t-paper)" }}
      >
        <p
          className="t-m__dir m-0 text-[12px]"
          style={{ color: "var(--t-muted-dark-2)" }}
        >
          (the rest is behind the curtain.)
        </p>
        {/* No number. The cap has moved once already and copy that names it
            goes stale silently. */}
        <p className="t-m__display m-0 mt-2 text-[28px] leading-[1.05]">
          {words.tasted ? words.overTitle : <>That&rsquo;s your free reads for the month.</>}
        </p>
        <p
          className="m-0 mt-2.5 text-[14px]"
          style={{ color: "var(--t-muted-dark)" }}
        >
          {words.tasted
            ? words.overBody
            : "Plus opens this piece and every other, start to finish. Anything you've saved stays open either way."}
        </p>
        <PlusOffer feature={feature} lead="read" />
      </div>
    </div>
  );
}
