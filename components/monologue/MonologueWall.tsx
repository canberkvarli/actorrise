"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
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
    <div className="mx-auto mt-2 max-w-[62ch]">
      {/* The piece doesn't end, it goes dim. Reads as the lights going down on
          the text rather than a banner dropped on top of it. */}
      <div
        aria-hidden
        className="-mt-24 h-24 bg-gradient-to-b from-transparent to-background"
      />

      <div className="border-t border-border/60 pt-6">
        <p className="font-typewriter text-sm text-muted-foreground">
          The rest of this one is behind the curtain.
        </p>
        <p className="mt-2 text-base text-foreground">
          That&rsquo;s your three free reads. Plus opens every piece in the
          library, start to finish.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Two weeks free, card on file, cancel before it renews.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href={href}>Start 2 weeks free</Link>
          </Button>
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            What else is in it
          </Link>
        </div>
      </div>
    </div>
  );
}
