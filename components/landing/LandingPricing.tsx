"use client";

/**
 * Landing page pricing — quiet light cards, with the featured tier inverted
 * to the dark stage palette and lit by the glow: the lead, under the light.
 * Uses cached pricing tiers (same as /pricing) so the pricing page loads
 * instantly when the user clicks through.
 */

import { usePricingTiers, DEFAULT_PRICING_TIERS, type PricingTier } from "@/hooks/usePricingTiers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

function getFeaturesList(tier: PricingTier): string[] {
  const features: string[] = [];

  // Monologue rehearsals — the core value
  const rehearsals = tier.features.monologue_sessions;
  if (rehearsals === -1) {
    features.push("Unlimited monologue rehearsals");
  } else if (rehearsals && rehearsals > 0) {
    features.push(`${rehearsals} free rehearsals, then 2 weeks of Plus free`);
  }

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

  // Overdone filter
  if (tier.name !== "free") {
    features.push("Overdone filter");
  }

  return features;
}

const MOBILE_VISIBLE_FEATURES = 4;

const rise = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.1 },
  }),
};

function PricingCard({
  tier,
  index,
  formatPrice,
  isHighlighted,
}: {
  tier: PricingTier;
  index: number;
  formatPrice: (cents: number) => string;
  isHighlighted: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const features = getFeaturesList(tier);
  const isFree = tier.name === "free";
  const hasMore = features.length > MOBILE_VISIBLE_FEATURES;
  const price = isFree ? "$0" : formatPrice(tier.monthly_price_cents);

  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  return (
    <motion.div
      custom={index}
      variants={rise}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      className={
        isHighlighted
          ? "dark stage-scene relative flex flex-col rounded-xl border border-[color-mix(in_oklab,var(--stage-glow)_35%,var(--stage-line))] p-5 sm:p-6 lg:-my-3 lg:py-8 shadow-[0_24px_70px_-24px_color-mix(in_oklab,var(--stage-glow)_45%,transparent)]"
          : "relative flex flex-col rounded-xl border border-border/60 bg-card/40 p-5 sm:p-6 transition-colors duration-300 hover:border-border"
      }
    >
      {isHighlighted && (
        <p className="stage-direction text-xs text-primary">(most popular.)</p>
      )}

      <div className={isHighlighted ? "mt-2" : ""}>
        <h3 className={`text-lg font-semibold tracking-tight ${isHighlighted ? "text-[var(--stage-fg)]" : "text-foreground"}`}>
          {tier.display_name}
        </h3>
        <p className={`mt-2 font-brand text-3xl sm:text-4xl font-medium ${isHighlighted ? "text-[var(--stage-fg)]" : "text-foreground"}`}>
          {price}
          <span className={`text-sm font-normal ${isHighlighted ? "text-[var(--stage-muted)]" : "text-muted-foreground"}`}>
            /mo
          </span>
        </p>
      </div>

      <Button
        asChild
        variant={isHighlighted ? "default" : "outline"}
        className="mt-5 w-full"
      >
        <Link href={isFree ? "/signup" : "/pricing"}>
          {isFree ? "Get started free" : "Subscribe"}
        </Link>
      </Button>

      <ul className={`mt-5 pt-5 space-y-2.5 flex-1 border-t ${isHighlighted ? "border-[var(--stage-line)]" : "border-border/40"}`}>
        {features.map((f, i) => (
          <li
            key={i}
            className={`text-sm leading-relaxed flex items-start gap-2 ${
              isHighlighted ? "text-[var(--stage-muted)]" : "text-muted-foreground"
            } ${!expanded && i >= MOBILE_VISIBLE_FEATURES ? "hidden sm:flex" : ""}`}
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
          className={`sm:hidden mt-2 text-xs text-left transition-colors ${
            isHighlighted
              ? "text-[var(--stage-muted)] hover:text-[var(--stage-fg)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {expanded ? "Show less" : `+${features.length - MOBILE_VISIBLE_FEATURES} more`}
        </button>
      )}
    </motion.div>
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
    <section id="pricing" className="container mx-auto px-4 sm:px-6 py-14 sm:py-20 md:py-28">
      <div className="w-full max-w-6xl mx-auto">
        <div className="text-center">
          <h2 className="font-brand font-semibold text-2xl sm:text-3xl md:text-4xl">
            Your craft, your plan.
          </h2>
          <p className="stage-direction mt-4 text-sm text-muted-foreground">
            (new here? <span className="text-foreground">plus starts with a 2-week free trial.</span>{" "}
            $0 today, cancel anytime.)
          </p>
          <p className="stage-direction mt-1.5 text-sm text-muted-foreground">
            (students &amp; educators rehearse free. just email me.)
          </p>
        </div>

        {/* Columns follow however many plans there are. This was a hard
            lg:grid-cols-4, and retiring Solo left three cards in a four-column
            track: an empty slot on the right pushed the row off-centre under a
            heading that is centred, which reads as a layout bug rather than as
            one fewer plan. Three cards also centre on their own measure, so they
            do not stretch to fill a width meant for four. */}
        <div
          className={cn(
            "mt-12 sm:mt-16 grid gap-4 sm:gap-5 items-start lg:items-stretch",
            tiers.length === 3
              ? "grid-cols-1 sm:grid-cols-3 max-w-4xl mx-auto"
              : "grid-cols-2 lg:grid-cols-4",
          )}
        >
          {tiers.map((tier, i) => (
            <PricingCard
              key={tier.id}
              tier={tier}
              index={i}
              formatPrice={formatPrice}
              isHighlighted={tier.name === "plus"}
            />
          ))}
        </div>

        <p className="mt-10 text-center">
          <Link
            href="/pricing"
            className="stage-direction text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            (compare all plans &amp; faq &#8594;)
          </Link>
        </p>
      </div>
    </section>
  );
}
