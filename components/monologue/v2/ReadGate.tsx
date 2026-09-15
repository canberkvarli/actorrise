"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

import { useSubscription } from "@/hooks/useSubscription";
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

  useEffect(() => {
    trackUpgradeModalViewed({ feature, tier_current: currentTier });
  }, [feature, currentTier]);

  // ?from= so checkout can attribute the conversion to THIS gate.
  // begin_checkout fires there, not here, or every conversion counts twice.
  const href = `/checkout?tier=plus&period=monthly&trial=1&from=${feature}`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[62%] items-end justify-center pb-2">
      <div aria-hidden className="t-m__gatefade absolute inset-0" />
      <div
        className="t-m__hard-gel t-m-pop pointer-events-auto relative w-full max-w-[460px] -rotate-[0.8deg] rounded-lg border-[1.5px] px-[26px] py-6 text-center"
        style={{ borderColor: "var(--t-text)", background: "var(--t-paper)" }}
      >
        <p
          className="t-m__dir m-0 text-[12px]"
          style={{ color: "var(--t-muted-dark-2)" }}
        >
          (the rest is behind the curtain.)
        </p>
        {/* No number. The cap has moved once already and copy that names it
            goes stale silently — the same reason MonologuePaywallModal refuses
            to count. */}
        <p className="t-m__display m-0 mt-2 text-[28px] leading-[1.05]">
          That&rsquo;s your free reads for the month.
        </p>
        <p
          className="m-0 mt-2.5 text-[14px]"
          style={{ color: "var(--t-muted-dark)" }}
        >
          Plus opens every piece in the library, start to finish. Anything
          you&rsquo;ve already saved stays open either way.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={href}
            className="inline-flex h-12 items-center gap-2.5 rounded-full pl-5 pr-1.5 text-[15px] font-bold transition-transform duration-300 hover:scale-[1.04] hover:-rotate-1"
            style={{ background: "var(--t-cta-bg)", color: "var(--t-cta-fg)" }}
          >
            Start 2 weeks free
            <span
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full"
              style={{
                background: "var(--t-cta-dot-bg)",
                color: "var(--t-cta-dot-fg)",
              }}
            >
              <IconArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
          <Link
            href="/pricing"
            className="t-m__dir inline-flex h-12 items-center rounded-full border-[1.5px] px-4 text-[12px] transition-colors"
            style={{
              borderColor: "var(--t-line-light)",
              color: "var(--t-muted-dark-2)",
            }}
          >
            (what else is in it)
          </Link>
        </div>
        <p
          className="m-0 mt-3.5 text-[12px]"
          style={{ color: "var(--t-faint)" }}
        >
          Card on file, cancel before it renews.
        </p>
      </div>
    </div>
  );
}
