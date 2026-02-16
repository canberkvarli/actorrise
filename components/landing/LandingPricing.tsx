"use client";

/**
 * Landing page pricing section. Fetches tiers from API and shows plan benefits
 * on the home page to reduce friction (no need to visit /pricing to see what's included).
 */

import { useState, useEffect } from "react";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

interface PricingTier {
  id: number;
  name: string;
  display_name: string;
  description: string;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  features: {
    ai_searches_per_month: number;
    bookmarks_limit: number;
    recommendations: boolean;
    scene_partner_sessions?: number;
    craft_coach_sessions?: number;
    download_formats: string[];
    priority_support: boolean;
    advanced_analytics?: boolean;
    collections?: boolean;
    collaboration?: boolean;
    white_label_export?: boolean;
  };
  sort_order: number;
}

const DEFAULT_TIERS: PricingTier[] = [
  {
    id: 1,
    name: "free",
    display_name: "Free",
    description: "Perfect for exploring ActorRise",
    monthly_price_cents: 0,
    annual_price_cents: 0,
    features: {
      ai_searches_per_month: 10,
      bookmarks_limit: 5,
      recommendations: false,
      download_formats: ["txt"],
      priority_support: false,
    },
    sort_order: 0,
  },
  {
    id: 2,
    name: "plus",
    display_name: "Plus",
    description: "For actors",
    monthly_price_cents: 1200,
    annual_price_cents: 9900,
    features: {
      ai_searches_per_month: 150,
      bookmarks_limit: -1,
      recommendations: true,
      download_formats: ["txt", "pdf"],
      priority_support: true,
    },
    sort_order: 1,
  },
  {
    id: 3,
    name: "unlimited",
    display_name: "Unlimited",
    description: "Unlimited searches and more",
    monthly_price_cents: 2400,
    annual_price_cents: 19900,
    features: {
      ai_searches_per_month: -1,
      bookmarks_limit: -1,
      recommendations: true,
      download_formats: ["txt", "pdf"],
      priority_support: true,
    },
    sort_order: 2,
  },
];

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

  if (tier.features.scene_partner_sessions) {
    features.push(`${tier.features.scene_partner_sessions} ScenePartner AI sessions/month`);
  }
  if (tier.features.craft_coach_sessions) {
    features.push(`${tier.features.craft_coach_sessions} CraftCoach feedback sessions/month`);
  }
  if (tier.features.advanced_analytics) {
    features.push("Advanced analytics & insights");
  }
  if (tier.features.priority_support) {
    features.push("Priority email support");
  } else {
    features.push("Community support");
  }

  return features;
}

export function LandingPricing() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const apiUrl = typeof window !== "undefined" ? API_URL : "";
    const url = apiUrl ? `${apiUrl}/api/pricing/tiers` : "";

    if (!url) {
      setTiers(DEFAULT_TIERS);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: PricingTier[]) => {
        setTiers(Array.isArray(data) && data.length > 0 ? data : DEFAULT_TIERS);
        setIsLoading(false);
      })
      .catch(() => {
        setTiers(DEFAULT_TIERS);
        setIsLoading(false);
      })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

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
          Free tier to explore. Upgrade when you&apos;re ready.
        </p>
        <div className="mt-12 grid md:grid-cols-3 gap-8">
          {tiers.map((tier) => {
            const features = getFeaturesList(tier);
            const isFree = tier.name === "free";
            return (
              <div
                key={tier.id}
                className="rounded-xl border border-border/60 bg-card/40 p-8 flex flex-col"
              >
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
                <Button asChild variant="outline" className="mt-6 w-full">
                  <Link href={isFree ? "/signup" : "/pricing"}>
                    {isFree ? "Get started" : tier.name === "plus" ? "Subscribe" : "See plans"}
                  </Link>
                </Button>
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
