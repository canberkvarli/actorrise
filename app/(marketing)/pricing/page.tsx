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
import { useT, useTList, type ListKey, type MessageKey } from "@/lib/i18n";

type Translate = ReturnType<typeof useT>;

/* Prices stay in code, not in the dictionaries, so a translation can never
   quote a different number than the one Stripe charges. */
const SCHOOL_PRICES = { classroom: "$249", program: "$499" };

const faqs: { q: MessageKey; a: MessageKey; vars?: Record<string, string> }[] = [
  { q: "marketingPricing.q1", a: "marketingPricing.a1" },
  { q: "marketingPricing.q2", a: "marketingPricing.a2" },
  { q: "marketingPricing.q3", a: "marketingPricing.a3" },
  { q: "marketingPricing.q4", a: "marketingPricing.a4" },
  { q: "marketingPricing.q5", a: "marketingPricing.a5", vars: SCHOOL_PRICES },
  { q: "marketingPricing.q6", a: "marketingPricing.a6" },
  { q: "marketingPricing.q7", a: "marketingPricing.a7" },
  { q: "marketingPricing.q8", a: "marketingPricing.a8" },
];

const QUOTE = "mailto:canberk@actorrise.com?subject=Class%20plan%20quote";

const SCHOOL_PLANS: {
  key: string;
  name: MessageKey;
  /** A literal price, or a dictionary key when there is no number ("Quote"). */
  price: { amount: string } | { key: MessageKey };
  per: MessageKey | null;
  who: MessageKey;
  feats: ListKey;
  cta: MessageKey;
  href: string;
  pick: boolean;
}[] = [
  {
    key: "classroom",
    name: "marketingPricing.classroomName",
    price: { amount: SCHOOL_PRICES.classroom },
    per: "marketingPricing.perYear",
    who: "marketingPricing.classroomWho",
    feats: "marketingPricing.classroomFeats",
    cta: "marketingPricing.classroomCta",
    href: "/signup",
    pick: false,
  },
  {
    key: "program",
    name: "marketingPricing.programName",
    price: { amount: SCHOOL_PRICES.program },
    per: "marketingPricing.perYear",
    who: "marketingPricing.programWho",
    feats: "marketingPricing.programFeats",
    cta: "marketingPricing.getQuote",
    href: QUOTE,
    pick: true,
  },
  {
    key: "district",
    name: "marketingPricing.districtName",
    price: { key: "marketingPricing.districtPrice" },
    per: null,
    who: "marketingPricing.districtWho",
    feats: "marketingPricing.districtFeats",
    cta: "marketingPricing.getQuote",
    href: QUOTE,
    pick: false,
  },
];

function getFeaturesList(tier: PricingTier, t: Translate): string[] {
  const features: string[] = [];

  // Full pieces a month. The read wall's own number, served with the tier.
  // Every paid tier reads without a cap (subscriptions.usage_limits).
  const reads = tier.features.monologue_reads_per_month;
  if (tier.name !== "free") {
    features.push(t("marketingPricing.featEveryMonologue"));
  } else if (reads && reads > 0) {
    features.push(
      reads === 1
        ? t("marketingPricing.featReadsOne")
        : t("marketingPricing.featReads", { count: reads }),
    );
  }

  // Monologue rehearsals — the core value
  const rehearsals = tier.features.monologue_sessions;
  if (rehearsals === -1) {
    features.push(t("marketingPricing.featUnlimitedRehearsals"));
  } else if (rehearsals && rehearsals > 0) {
    features.push(t("marketingPricing.featRehearsals", { count: rehearsals }));
  }

  // AI searches
  if (tier.features.ai_searches_per_month === -1) {
    features.push(t("marketingPricing.featUnlimitedSearches"));
  } else {
    features.push(
      t("marketingPricing.featSearches", { count: tier.features.ai_searches_per_month }),
    );
  }

  // ScenePartner
  if (tier.features.scene_partner_trial_only) {
    features.push(t("marketingPricing.featScenePartnerTrial"));
  } else {
    const scenes = tier.features.scene_partner_sessions;
    if (scenes === -1) {
      features.push(t("marketingPricing.featUnlimitedScenes"));
    } else if (scenes && scenes > 0) {
      features.push(t("marketingPricing.featScenes", { count: scenes }));
    }
  }

  // Script uploads
  const scripts = tier.features.scene_partner_scripts;
  if (scripts === -1) {
    features.push(t("marketingPricing.featUnlimitedScripts"));
  } else if (scripts && scripts > 0) {
    features.push(
      t(scripts > 1 ? "marketingPricing.featScripts" : "marketingPricing.featScript", {
        count: scripts,
      }),
    );
  }

  // Overdone filter
  if (tier.name !== "free") {
    features.push(t("marketingPricing.featOverdone"));
  }

  return features;
}

function FAQAccordion() {
  const t = useT();
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
              <span>{t(faq.q)}</span>
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
              <p className="pb-5 pr-6">{t(faq.a, faq.vars)}</p>
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
  const t = useT();
  const tList = useTList();
  const [isAnnual, setIsAnnual] = useState(true);
  const { data: allTiers = DEFAULT_PRICING_TIERS, isLoading } = usePricingTiers();
  // "Monologues" is Ghost Light's tier, sold in the App Store through
  // RevenueCat. It has no Stripe price, so on the web its button led to a
  // checkout that could only fail.
  const tiers = allTiers.filter((t) => t.name !== "monologues");

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
        direction={t("marketingPricing.direction")}
        title={
          <>
            {t("marketingPricing.titleA")}
            <em className="italic text-primary">{t("marketingPricing.titleB")}</em>
            {t("marketingPricing.titleC")}
          </>
        }
        lede={t("marketingPricing.lede", { monthly: "$8.25", yearly: "$99" })}
      />

      {/* `t-box-office` because that is what this page is, and because it carries
          the dark flip for every --t-* the stubs below read. The marketing
          layout already mounts theatre-tokens and the three faces. */}
      <div className="t-box-office container mx-auto max-w-7xl px-4 py-10 sm:py-16">
        <div className="mb-10 flex flex-col items-center gap-2">
          <div className="t-switch" role="group" aria-label={t("marketingPricing.billingPeriod")}>
            <button
              type="button"
              className="t-switch__opt"
              aria-pressed={!isAnnual}
              onClick={() => setIsAnnual(false)}
            >
              {t("marketingPricing.monthly")}
            </button>
            <button
              type="button"
              className="t-switch__opt"
              aria-pressed={isAnnual}
              onClick={() => setIsAnnual(true)}
            >
              {t("marketingPricing.annual")}
            </button>
          </div>
          <p className="t-box-office__dir" style={{ minHeight: 18 }}>
            {isAnnual ? t("marketingPricing.saves") : ""}
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
            const features = getFeaturesList(tier, t);
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
                  {isHighlighted && <span className="t-ticket__flag">{t("marketingPricing.mostTaken")}</span>}

                  <h3 className="t-ticket__plan" style={{ fontSize: 22 }}>
                    {tier.display_name}
                  </h3>

                  <p className="t-ticket__price">
                    {formatPrice(price)}
                    <span className="t-ticket__per">{t("marketingPricing.perMonth")}</span>
                  </p>

                  {isAnnual && tier.annual_price_cents && tier.annual_price_cents > 0 ? (
                    <p className="t-ticket__fine" style={{ marginTop: 8 }}>
                      {savings && savings.savings > 0
                        ? t("marketingPricing.billedYearSaving", {
                            price: formatPrice(tier.annual_price_cents),
                            savings: formatPrice(savings.savings),
                          })
                        : t("marketingPricing.billedYear", {
                            price: formatPrice(tier.annual_price_cents),
                          })}
                    </p>
                  ) : null}

                  <ul className="t-ticket__feats">
                    {features.map((feature, idx) => (
                      <li key={idx} className="t-ticket__feat">
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link prefetch={false}
                    href={
                      isFree
                        ? "/signup"
                        : // Plus starts on the free trial at either period; the
                          // trial rolls into the period picked. Without
                          // trial=1 an annual Plus click was charged $99 today.
                          `/checkout?tier=${tier.name}&period=${isAnnual ? "annual" : "monthly"}${
                            tier.name === "plus" ? "&trial=1" : ""
                          }&from=pricing`
                    }
                    className={`t-ticket__cta mt-5 w-full${
                      isHighlighted ? "" : " t-ticket__cta--quiet"
                    }`}
                  >
                    {isFree ? t("marketingPricing.startFree") : t("marketingPricing.takeThis")}
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Classes and schools. A teacher's class gets the free month through
            their class link; these keep it on after that, paid by the school on
            one invoice (backend: class_link.py plan). Prices set 2026-10-29,
            just under StageAgent's school plans. */}
        <div id="schools" className="mx-auto mt-4 max-w-5xl">
          <p className="t-box-office__dir text-center">{t("marketingPricing.schoolsDirection")}</p>
          <h2 className="t-box-office__title text-center" style={{ marginBottom: 8 }}>
            {t("marketingPricing.schoolsTitle")}
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-[15px] leading-normal" style={{ color: "var(--t-muted-dark, inherit)" }}>
            {t("marketingPricing.schoolsBody")}
          </p>
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-3 sm:gap-6">
            {SCHOOL_PLANS.map((plan) => (
              <div key={plan.key} className="relative h-full">
                <div className={`t-ticket t-ticket--stub${plan.pick ? " t-ticket--pick" : ""}`}>
                  <h3 className="t-ticket__plan" style={{ fontSize: 22 }}>
                    {t(plan.name)}
                  </h3>
                  <p className="t-ticket__price">
                    {"key" in plan.price ? t(plan.price.key) : plan.price.amount}
                    {plan.per ? <span className="t-ticket__per">{t(plan.per)}</span> : null}
                  </p>
                  <p className="t-ticket__fine" style={{ marginTop: 8 }}>
                    {t(plan.who)}
                  </p>
                  <ul className="t-ticket__feats">
                    {tList(plan.feats).map((f) => (
                      <li key={f} className="t-ticket__feat">
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={plan.href}
                    className={`t-ticket__cta mt-5 w-full${plan.pick ? "" : " t-ticket__cta--quiet"}`}
                  >
                    {t(plan.cta)}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <p className="t-box-office__dir">{t("marketingPricing.faqDirection")}</p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="t-box-office__title"
            style={{ marginBottom: 18 }}
          >
            {t("marketingPricing.faqTitle")}
          </motion.h2>
          <FAQAccordion />
        </div>
      </div>
    </>
  );
}
