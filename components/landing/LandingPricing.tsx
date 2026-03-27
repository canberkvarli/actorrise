"use client";

/**
 * Landing page pricing section. Uses cached pricing tiers (same as /pricing)
 * so the pricing page loads instantly when the user clicks through.
 */

import { usePricingTiers, DEFAULT_PRICING_TIERS, type PricingTier } from "@/hooks/usePricingTiers";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

function getFeaturesList(tier: PricingTier): string[] {
  const features: string[] = [];

  // AI searches
  if (tier.features.ai_searches_per_month === -1) {
    features.push("Unlimited AI searches");
  } else {
    features.push(`${tier.features.ai_searches_per_month} AI searches/mo`);
  }

  // ScenePartner
  if (tier.features.scene_partner_trial_only) {
    features.push("1 ScenePartner trial");
  } else {
    const scenes = tier.features.scene_partner_sessions;
    if (scenes === -1) {
      features.push("Unlimited ScenePartner scenes");
    } else if (scenes && scenes > 0) {
      features.push(`${scenes} ScenePartner scenes/mo`);
    }
  }

  // Script uploads
  const scripts = tier.features.scene_partner_scripts;
  if (scripts === -1) {
    features.push("Unlimited script uploads");
  } else if (scripts && scripts > 0) {
    features.push(`${scripts} script upload${scripts > 1 ? "s" : ""}`);
  }

  // Bookmarks
  if (tier.features.bookmarks_limit === -1) {
    features.push("Unlimited bookmarks");
  } else {
    features.push(`${tier.features.bookmarks_limit} bookmarks`);
  }

  // Overdone filter
  if (tier.name !== "free") {
    features.push("Overdone filter");
  }

  return features;
}

const MOBILE_VISIBLE_FEATURES = 4;

function PricingCard({ tier, formatPrice, isHighlighted }: { tier: PricingTier; formatPrice: (cents: number) => string; isHighlighted: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const features = getFeaturesList(tier);
  const isFree = tier.name === "free";
  const hasMore = features.length > MOBILE_VISIBLE_FEATURES;

  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  return (
    <div className={`border p-5 sm:p-6 flex flex-col relative ${isHighlighted ? "border-primary/40 bg-primary/[0.03]" : "border-border/60 bg-card/40"}`}>
      {isHighlighted && (
        <div className="absolute -top-2.5 left-4">
          <span className="bg-primary px-2 py-0.5 text-[11px] font-medium text-white">
            Most popular
          </span>
        </div>
      )}
      <div className="flex items-baseline justify-between sm:block">
        <h3 className="text-lg sm:text-xl font-semibold tracking-tight">{tier.display_name}</h3>
        <p className="sm:mt-1 text-lg sm:text-xl font-bold">
          {isFree ? "$0" : formatPrice(tier.monthly_price_cents)}
          <span className="text-xs font-normal text-muted-foreground">/mo</span>
        </p>
      </div>
      <ul className="mt-4 space-y-2 flex-1">
        {features.map((f, i) => (
          <li
            key={i}
            className={`text-sm text-muted-foreground flex items-start gap-2 ${
              !expanded && i >= MOBILE_VISIBLE_FEATURES ? "hidden sm:flex" : ""
            }`}
          >
            <span className="text-primary mt-0.5 text-sm shrink-0">&#10003;</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={toggleExpanded}
          className="sm:hidden mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
        >
          {expanded ? "Show less" : `+${features.length - MOBILE_VISIBLE_FEATURES} more`}
        </button>
      )}
      <Button asChild variant={isHighlighted ? "default" : "outline"} className="mt-4 w-full">
        <Link href={isFree ? "/signup" : "/pricing"}>
          {isFree ? "Get started free" : "Subscribe"}
        </Link>
      </Button>
    </div>
  );
}

export function LandingPricing() {
  const { data: apiTiers } = usePricingTiers();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const tiers = mounted && apiTiers ? apiTiers : DEFAULT_PRICING_TIERS;

  const formatPrice = (cents: number) => {
    if (cents === 0) return "$0";
    const dollars = cents / 100;
    return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
  };

  return (
    <section id="pricing" className="container mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-28 border-t border-border/60">
      <div className="w-full max-w-[min(1400px,100%)] mx-auto">
        {/* Header */}
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl md:text-4xl tracking-[-0.03em]">
            Your craft, your plan.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Upgrade when you need more.
          </p>
        </div>

        {/* Early access + student/educator banner */}
        <div className="mt-6 space-y-3">
          <div className="inline-flex items-center gap-3 px-4 py-2.5 border border-primary/20 bg-primary/[0.03]">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
            <p className="text-sm">
              <span className="font-medium">Early access?</span>{" "}
              <span className="text-muted-foreground">Reach out for 12 months free on Plus. <a href="mailto:canberk@actorrise.com" className="underline hover:text-foreground">canberk@actorrise.com</a></span>
            </p>
          </div>
          <div className="inline-flex items-center gap-3 px-4 py-2.5 border border-border/40 bg-card/40">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Students & educators</span> get free access. Just email me.
            </p>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="mt-10 sm:mt-12 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {tiers.map((tier) => (
            <PricingCard
              key={tier.id}
              tier={tier}
              formatPrice={formatPrice}
              isHighlighted={tier.name === "plus"}
            />
          ))}
        </div>

        <p className="mt-6 text-center">
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Compare all plans &amp; FAQ &#8594;
          </Link>
        </p>
      </div>
    </section>
  );
}
