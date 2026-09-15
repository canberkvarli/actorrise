"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSubscription } from "@/hooks/useSubscription";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { trackUpgradeModalViewed } from "@/lib/analytics";

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

  useEffect(() => {
    trackUpgradeModalViewed({ feature, tier_current: currentTier });
  }, [feature, currentTier]);

  // ?from= so the checkout page can attribute the conversion to THIS wall.
  // begin_checkout is fired there, not here, or every conversion counts twice.
  const href = `/checkout?tier=plus&period=monthly&trial=1&from=${feature}`;

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
      <p className="t-wall__title">That&rsquo;s your free reads for the month.</p>
      <p className="t-wall__body">
        Plus opens every piece in the library, start to finish. Anything
        you&rsquo;ve already saved stays open either way.
      </p>

      <div className="t-wall__foot">
        <Link href={href} className="t-wall__cta">
          Start 2 weeks free
        </Link>
        <Link href="/pricing" className="t-wall__quiet">
          what else is in it
        </Link>
      </div>

      <p className="t-wall__body" style={{ marginTop: 14, fontSize: 12 }}>
        Card on file, cancel before it renews.
      </p>
    </div>
  );
}
