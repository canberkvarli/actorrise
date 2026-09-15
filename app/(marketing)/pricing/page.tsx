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
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { motion } from "framer-motion";
import { StageHero } from "@/components/marketing/StageHero";

const faqs = [
  {
    question: "Can I switch plans later?",
    answer:
      "Yes. Move up, move down or cancel whenever you like. The change lands at the end of the period you already paid for.",
  },
  {
    question: "What happens when I hit the search limit?",
    answer:
      "AI search pauses until the month turns over, or until you move up. Browsing the library by hand stays open either way.",
  },
  {
    question: "What counts as a ScenePartner scene?",
    answer:
      "Each new scene you start counts once. Run that same scene as many times as you want and it still counts once.",
  },
  {
    question: "I'm a student. Is there a discount?",
    answer:
      "Students don't pay at all. Sign up free, then have your teacher email me at canberk@actorrise.com with the addresses, and I'll open Plus for the class.",
  },
  {
    question: "I teach. Can I get this for my students?",
    answer:
      "Yes, and for yourself. Sign up at actorrise.com, email me the address you used, and I'll switch Plus on for you, free. A month to start, and if you need longer just say so. Send your students' addresses along and I'll do the same for them.",
  },
  {
    question: "How do I pay?",
    answer:
      "Visa, Mastercard and Amex, through Stripe. The card details never touch my server.",
  },
  {
    question: "Can I cancel any time?",
    answer:
      "Any time, no commitment. You keep access to the end of the period you paid for, and your bookmarks stay put whatever you decide.",
  },
];

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

function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div>
      {faqs.map((faq, index) => {
        const open = openIndex === index;
        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.04 }}
            className="t-faq__row"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              className="t-faq__q"
              aria-expanded={open}
            >
              <span>{faq.question}</span>
              <motion.span
                aria-hidden
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0"
                style={{ color: "var(--t-muted-dark-2)" }}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </motion.span>
            </button>
            <motion.div
              initial={false}
              animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
              transition={{ duration: 0.2 }}
              className="t-faq__a"
            >
              <p className="pb-5 pr-6">{faq.answer}</p>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function PricingPage() {
  // Default to annual — it's the better deal for the actor and the better LTV,
  // so lead with it (they can flip to monthly).
  const [isAnnual, setIsAnnual] = useState(true);
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
      <div className="container mx-auto max-w-7xl px-4 py-16">
        <Skeleton className="mx-auto mb-8 h-12 w-64" />
        <div className="grid gap-6 md:grid-cols-4">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <>
      <StageHero
        direction="(the ticket.)"
        title={
          <>
            Your <em className="italic text-primary">craft</em>, your plan.
          </>
        }
        lede="Start free, no card. Move up when you need more."
      />

      {/* `t-box-office` because that is what this page is, and because it carries
          the dark flip for every --t-* the stubs below read. The marketing
          layout already mounts theatre-tokens and the three faces. */}
      <div className="t-box-office container mx-auto max-w-7xl px-4 py-10 sm:py-16">
        <div className="mb-10 flex flex-col items-center gap-2">
          <div className="t-switch" role="group" aria-label="Billing period">
            <button
              type="button"
              className="t-switch__opt"
              aria-pressed={!isAnnual}
              onClick={() => setIsAnnual(false)}
            >
              Monthly
            </button>
            <button
              type="button"
              className="t-switch__opt"
              aria-pressed={isAnnual}
              onClick={() => setIsAnnual(true)}
            >
              Annual
            </button>
          </div>
          <p className="t-box-office__dir" style={{ minHeight: 18 }}>
            {isAnnual ? "(saves up to 31%.)" : ""}
          </p>
        </div>

        {/* Columns follow the tiers the API actually returns. Hardcoded to four,
            a three-tier response left a dead column and threw the row off centre.
            Static class names, because Tailwind cannot see a computed one, and an
            inline gridTemplateColumns would beat the responsive classes on a
            phone and stack three stubs side by side at 390px. */}
        <div
          className={`mb-16 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 sm:gap-6 ${
            tiers.length >= 4
              ? "lg:grid-cols-4"
              : tiers.length === 3
                ? "lg:grid-cols-3"
                : "lg:grid-cols-2"
          }`}
        >
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
                className="relative h-full"
              >
                <div
                  className={`t-ticket t-ticket--stub${isHighlighted ? " t-ticket--pick" : ""}`}
                >
                  {isHighlighted && <span className="t-ticket__flag">Most taken</span>}

                  <h3 className="t-ticket__plan" style={{ fontSize: 22 }}>
                    {tier.display_name}
                  </h3>

                  <p className="t-ticket__price">
                    {formatPrice(price)}
                    <span className="t-ticket__per">/mo</span>
                  </p>

                  {isAnnual && tier.annual_price_cents && tier.annual_price_cents > 0 ? (
                    <p className="t-ticket__fine" style={{ marginTop: 8 }}>
                      Billed at {formatPrice(tier.annual_price_cents)} a year
                      {savings && savings.savings > 0
                        ? `, saving ${formatPrice(savings.savings)}`
                        : ""}
                      .
                    </p>
                  ) : null}

                  <ul className="t-ticket__feats">
                    {features.map((feature, idx) => (
                      <li key={idx} className="t-ticket__feat">
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={
                      isFree
                        ? "/signup"
                        : `/checkout?tier=${tier.name}&period=${isAnnual ? "annual" : "monthly"}`
                    }
                    className={`t-ticket__cta mt-5 w-full${
                      isHighlighted ? "" : " t-ticket__cta--quiet"
                    }`}
                  >
                    {isFree ? "Start free" : "Take this one"}
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <p className="t-box-office__dir">(the back of the programme.)</p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="t-box-office__title"
            style={{ marginBottom: 18 }}
          >
            Questions, answered.
          </motion.h2>
          <FAQAccordion />
        </div>
      </div>
    </>
  );
}
