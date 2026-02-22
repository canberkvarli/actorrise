"use client";

/**
 * Landing page pricing section. Uses cached pricing tiers (same as /pricing)
 * so the pricing page loads instantly when the user clicks through.
 */

import { usePricingTiers, DEFAULT_PRICING_TIERS, type PricingTier } from "@/hooks/usePricingTiers";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

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
  } else {
    features.push("Basic browsing");
  }

  features.push(`Download as ${tier.features.download_formats.join(", ").toUpperCase()}`);

  const sp = tier.features.scene_partner_sessions;
  if (sp) {
    if (sp === 1) {
      features.push("1 ScenePartner AI session (one-time)");
    } else {
      features.push(`${sp} ScenePartner AI sessions/month`);
    }
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

export function LandingPricing() {
  const { data: tiers = DEFAULT_PRICING_TIERS, isLoading } = usePricingTiers();

  const formatPrice = (cents: number) => (cents === 0 ? "$0" : `$${(cents / 100).toFixed(0)}`);

  if (isLoading) {
    return (
      <section id="pricing" className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
        <div className="w-full max-w-[min(1400px,100%)] mx-auto">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64 mb-12" />
          <div className="grid md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="pricing" className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
      <div className="w-full max-w-[min(1400px,100%)] mx-auto">
        <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
          Simple pricing.
        </h2>
        <p className="mt-2 text-muted-foreground">
          Free tier to explore. Upgrade when you&apos;re ready. Start free; no credit card required.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cancel anytime. Upgrade only if you need more.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Founding member offer: 100% off for 12 months. Apply your code at checkout.
        </p>
        <div className="mt-12 grid md:grid-cols-3 gap-8">
          {tiers.map((tier) => {
            const features = getFeaturesList(tier);
            const isFree = tier.name === "free";
            const isUnlimited = tier.name === "unlimited";
            return (
              <div
                key={tier.id}
                className={`rounded-xl border border-border/60 p-8 flex flex-col relative ${
                  isUnlimited ? "bg-muted/30 opacity-75 grayscale-[0.4]" : "bg-card/40"
                }`}
              >
                {isUnlimited && (
                  <span className="absolute top-4 right-4 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Coming soon
                  </span>
                )}
                <h3 className="text-xl font-semibold">{tier.display_name}</h3>
                <p className="mt-1 text-2xl font-bold">
                  {formatPrice(tier.monthly_price_cents)}
                  {!isFree && (
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  )}
                </p>
                <ul className="mt-5 space-y-3 flex-1">
                  {features.map((f, i) => (
                    <li key={i} className="text-base md:text-lg text-muted-foreground flex items-start gap-3">
                      <span className="text-primary mt-0.5 text-lg md:text-xl shrink-0">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {isUnlimited ? (
                  <Button variant="outline" className="mt-6 w-full" disabled>
                    Coming soon
                  </Button>
                ) : (
                  <Button asChild variant="outline" className="mt-6 w-full">
                    <Link href={isFree ? "/signup" : "/pricing"}>
                      {isFree ? "Get started" : "Subscribe"}
                    </Link>
                  </Button>
                )}
              </div>
            );
          })}
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
