"use client";

import { useEffect } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { trackUpgradeModalViewed } from "@/lib/analytics";
import { PlusOffer } from "@/components/billing/PlusOffer";

interface MonologueWallProps {
  /** Where the wall fired, for begin_checkout attribution. */
  feature?: string;
}

/**
 * The end of the free reads, shown in place under a piece that stops early.
 *
 * Inline rather than a modal on purpose. The server now returns a teaser
 * instead of the whole speech, so the actor is looking at a paragraph that
 * simply stops. A modal can be dismissed, and dismissing it leaves them staring
 * at a fragment with nothing on the page explaining why it ends there. The wall
 * has to live where the text ran out.
 *
 * Until 2026-08-31 this state was unreachable: `_teaser` sliced the first two
 * lines and 97% of the corpus is a single unbroken paragraph, so the wall set
 * `paywalled: true` and shipped the full text underneath it. Nothing on the
 * client ever read the flag, because there was never anything to explain.
 */
export function MonologueWall({ feature = "monologue_read" }: MonologueWallProps) {
  const { subscription } = useSubscription();
  const currentTier = subscription?.tier_name ?? "free";
  const words = useTrialWords();

  useEffect(() => {
    trackUpgradeModalViewed({ feature, tier_current: currentTier });
  }, [feature, currentTier]);

  return (
    /* theatre-tokens and the faces ride on the wall itself. The monologue
       route binds no theatre surface, so without both every --t-* here
       resolves to nothing and the font-family rules are dropped whole. */
    <div
      className={`t-wall theatre-tokens ${theatreFontVars} mx-auto mt-2 max-w-[62ch]`}
    >
      {/* The piece doesn't end, it goes dim. Reads as the lights going down on
          the text rather than a banner dropped on top of it. */}
      <div
        aria-hidden
        className="-mt-24 h-24 bg-gradient-to-b from-transparent to-background"
      />

      <hr className="t-wall__rule" />
      <p className="t-wall__dir">(the rest is behind the curtain.)</p>
      {/* No number. The cap has already moved once and copy that names it
          goes stale silently, which is the same reason MonologuePaywallModal
          refuses to count. */}
      <p className="t-wall__title">
        {words.tasted ? words.overTitle : <>That&rsquo;s your free reads for the month.</>}
      </p>
      <p className="t-wall__body">
        {words.tasted ? (
          words.overBody
        ) : (
          <>
            Plus opens this piece and every other, start to finish. Anything
            you&rsquo;ve saved stays open either way.
          </>
        )}
      </p>

      <PlusOffer feature={feature} lead="read" />
    </div>
  );
}
