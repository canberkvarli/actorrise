"use client";

/**
 * Pricing Page
 *
 * Displays all pricing tiers with monthly/annual toggle, feature comparison,
 * and FAQ section. Uses cached pricing data (React Query) so reloads and
 * revisits are instant.
 */

import { useState } from "react";
import { usePricingTiers, DEFAULT_PRICING_TIERS, type PricingTier } from "@/hooks/usePricingTiers";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { motion } from "framer-motion";

const faqs = [
  {
    question: "Can I switch plans anytime?",
    answer: "Yes! You can upgrade, downgrade, or cancel your subscription at any time. Changes take effect at the end of your current billing period."
  },
  {
    question: "What happens when I reach my search limit?",
    answer: "You'll see a friendly upgrade prompt. You can still browse monologues manually, but AI-powered searches will be paused until next month or you upgrade."
  },
  {
    question: "What counts as a ScenePartner scene?",
    answer: "Each unique scene you start rehearsing counts as one scene. You can re-run the same scene as many times as you want without it counting again."
  },
  {
    question: "Is there a student discount?",
    answer:
      "Yes. Verified students get 50% off the Plus annual plan. Request a discount via the contact form and we'll email you a code after a quick review.",
  },
  {
    question: "Do you offer discounts for teachers, schools, or acting coaches?",
    answer:
      "Yes. Educators and acting coaches get 30% off any paid plan. Drama schools and institutions can contact us for group/institutional pricing. Request a discount via the contact form.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, Mastercard, American Express) via Stripe. All payments are secure and encrypted."
  },
  {
    question: "Can I cancel anytime?",
    answer: "Absolutely. There are no long-term commitments. Cancel anytime and you'll continue to have access until the end of your billing period. Your bookmarks and data are preserved even after cancellation."
  }
];

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

function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {faqs.map((faq, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: index * 0.05 }}
        >
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="w-full text-left py-4 px-6 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">{faq.question}</h3>
              <motion.div
                animate={{ rotate: openIndex === index ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </motion.div>
            </div>
            <motion.div
              initial={false}
              animate={{
                height: openIndex === index ? "auto" : 0,
                opacity: openIndex === index ? 1 : 0,
              }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="text-muted-foreground mt-3 pr-12">
                {faq.answer}
              </p>
            </motion.div>
          </button>
        </motion.div>
      ))}
    </div>
  );
}

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const { data: tiers = DEFAULT_PRICING_TIERS, isLoading } = usePricingTiers();

  const formatPrice = (cents: number) => {
    const dollars = cents / 100;
    return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
  };

  const calculateSavings = (monthly: number, annual: number) => {
    const monthlyCost = monthly * 12;
    const savings = monthlyCost - annual;
    const percentOff = Math.round((savings / monthlyCost) * 100);
    return { savings, percentOff };
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-7xl">
        <Skeleton className="h-12 w-64 mb-8 mx-auto" />
        <div className="grid md:grid-cols-4 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-12">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl lg:text-5xl font-bold mb-4"
        >
          Simple pricing, no surprises.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-lg text-muted-foreground max-w-2xl mx-auto"
        >
          Start free, upgrade when you need more.
        </motion.p>

        {/* Founding member banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 mx-auto max-w-lg flex items-center justify-center gap-3 px-5 py-3 border border-primary/20 bg-primary/[0.03]"
        >
          <span className="h-2 w-2 bg-primary animate-pulse" />
          <p className="text-sm">
            <span className="font-medium">50 founding member spots.</span>{" "}
            <span className="text-muted-foreground">100% off Plus for 12 months.</span>
          </p>
        </motion.div>

        {/* Annual/Monthly Toggle */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col items-center gap-2 mt-8"
        >
          <div className="flex items-center justify-center gap-4">
            <Label htmlFor="billing-toggle" className={!isAnnual ? "font-semibold" : ""}>
              Monthly
            </Label>
            <Switch
              id="billing-toggle"
              checked={isAnnual}
              onCheckedChange={setIsAnnual}
            />
            <Label htmlFor="billing-toggle" className={isAnnual ? "font-semibold" : ""}>
              Annual
            </Label>
          </div>
          <div className="h-4 flex items-center justify-center">
            {isAnnual && (
              <motion.span
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-xs text-muted-foreground"
              >
                Save up to 31%
              </motion.span>
            )}
          </div>
        </motion.div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-16 items-stretch">
        {tiers.map((tier, index) => {
          const price =
            isAnnual && tier.annual_price_cents
              ? tier.annual_price_cents / 12
              : tier.monthly_price_cents;

          const savings =
            tier.annual_price_cents && tier.monthly_price_cents
              ? calculateSavings(tier.monthly_price_cents, tier.annual_price_cents)
              : null;

          const isHighlighted = tier.name === "plus";
          const features = getFeaturesList(tier);
          const isFree = tier.name === "free";

          return (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="h-full"
            >
              <div
                className={`h-full flex flex-col relative border p-5 sm:p-7 ${
                  isHighlighted
                    ? "border-primary/40 bg-primary/[0.03]"
                    : "border-border/50 bg-card/30"
                }`}
              >
                {isHighlighted && (
                  <div className="absolute -top-2.5 left-4">
                    <span className="bg-primary px-2 py-0.5 text-[11px] font-medium text-white">
                      Most popular
                    </span>
                  </div>
                )}

                <div>
                  <h3 className="text-xl sm:text-2xl font-semibold">{tier.display_name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{tier.description}</p>
                </div>

                {price > 0 ? (
                  <div className="mt-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl sm:text-4xl font-bold">{formatPrice(price)}</span>
                      <span className="text-muted-foreground text-sm">/mo</span>
                    </div>
                    {isAnnual && tier.annual_price_cents && tier.annual_price_cents > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Billed annually at {formatPrice(tier.annual_price_cents)}
                      </p>
                    )}
                    {isAnnual && savings && savings.savings > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Save {formatPrice(savings.savings)}/year
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4">
                    <span className="text-3xl sm:text-4xl font-bold">$0</span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                  </div>
                )}

                <ul className="mt-5 space-y-2.5 flex-1">
                  {features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary text-sm mt-0.5 shrink-0">&#10003;</span>
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={isHighlighted ? "default" : "outline"}
                  className="mt-6 w-full"
                >
                  <Link
                    href={
                      isFree
                        ? "/signup"
                        : `/checkout?tier=${tier.name}&period=${isAnnual ? "annual" : "monthly"}`
                    }
                  >
                    {isFree ? "Get started free" : "Subscribe"}
                  </Link>
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto mt-16">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl font-bold mb-12 text-center"
        >
          Frequently Asked Questions
        </motion.h2>
        <FAQAccordion />
      </div>
    </div>
  );
}
