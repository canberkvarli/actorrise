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

  if (tier.features.ai_searches_per_month === -1) {
    features.push("Unlimited AI searches");
  } else {
    features.push(`${tier.features.ai_searches_per_month} AI searches/month`);
  }

  if (tier.features.bookmarks_limit === -1) {
    features.push("Unlimited bookmarks");
  } else {
    features.push(`Up to ${tier.features.bookmarks_limit} bookmarks`);
  }

  if (tier.features.recommendations) {
    features.push("Personalized recommendations");
    features.push("AI fit to your type & casting scenario");
    features.push("Overdone filter: fresh pieces casting directors want to see");
  } else {
    features.push("Basic browsing");
  }

  features.push(`Download as ${tier.features.download_formats.join(", ").toUpperCase()}`);

  // ScenePartner
  const scripts = tier.features.scene_partner_scripts;
  const sessions = tier.features.scene_partner_sessions;
  if (scripts !== undefined) {
    if (scripts === -1) {
      features.push("Unlimited script uploads");
    } else if (scripts > 0) {
      features.push(`Up to ${scripts} script uploads`);
    }
  }
  if (tier.features.scene_partner_trial_only) {
    features.push("1 trial rehearsal (example script)");
  } else if (sessions !== undefined && sessions > 0) {
    features.push(`${sessions} ScenePartner AI sessions/month`);
  }
  if (tier.features.advanced_analytics) {
    features.push("Advanced analytics & insights");
  }
  if (tier.features.collections) {
    features.push("Collections & organization");
  }
  if (tier.features.collaboration) {
    features.push("Collaboration & sharing");
  }
  if (tier.features.white_label_export) {
    features.push("White-label export (no branding)");
  }
  if (tier.features.priority_support) {
    features.push("Priority email support");
  } else {
    features.push("Community support");
  }

  return features;
}

const MOBILE_VISIBLE_FEATURES = 4;

function PricingCard({ tier, formatPrice }: { tier: PricingTier; formatPrice: (cents: number) => string }) {
  const [expanded, setExpanded] = useState(false);
  const features = getFeaturesList(tier);
  const isFree = tier.name === "free";
  const hasMore = features.length > MOBILE_VISIBLE_FEATURES;

  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  return (
    <div className="rounded-xl border border-border/60 p-5 sm:p-8 flex flex-col relative bg-card/40">
      <div className="flex items-baseline justify-between sm:block">
        <h3 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight">{tier.display_name}</h3>
        {!isFree && (
          <p className="sm:mt-1 text-xl sm:text-2xl font-bold">
            {formatPrice(tier.monthly_price_cents)}
            <span className="text-sm font-normal text-muted-foreground">/mo</span>
          </p>
        )}
      </div>
      <ul className="mt-4 sm:mt-5 space-y-2 sm:space-y-3 flex-1">
        {features.map((f, i) => (
          <li
            key={i}
            className={`text-sm sm:text-base md:text-lg text-muted-foreground flex items-start gap-2 sm:gap-3 ${
              !expanded && i >= MOBILE_VISIBLE_FEATURES ? "hidden sm:flex" : ""
            }`}
          >
            <span className="text-primary mt-0.5 text-base sm:text-lg md:text-xl shrink-0">✓</span>
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
          {expanded ? "Show less" : `+${features.length - MOBILE_VISIBLE_FEATURES} more features`}
        </button>
      )}
      <Button asChild variant="outline" className="mt-4 sm:mt-6 w-full">
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
        <div className="inline-flex items-center gap-2 border border-primary/20 bg-primary/5 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium mb-4">
          Free while in early access · No credit card required
        </div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl tracking-[-0.03em]">
          Start free. Upgrade when you need more.
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl">
          Cancel anytime. <strong>Founding member offer:</strong> 100% off for 12 months. Apply your code at checkout.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 px-3 sm:px-4 py-2 border border-primary/30 bg-primary/5 text-xs sm:text-sm font-medium">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          50 founding member spots remaining
        </div>
        <div className="mt-8 sm:mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
          {tiers.map((tier) => (
            <PricingCard key={tier.id} tier={tier} formatPrice={formatPrice} />
          ))}
        </div>
        <p className="mt-6 text-center">
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            See all plans & features →
          </Link>
        </p>
      </div>
    </section>
  );
}
