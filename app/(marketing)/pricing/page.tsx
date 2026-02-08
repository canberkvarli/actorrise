"use client";

/**
 * Pricing Page
 *
 * Displays all pricing tiers with monthly/annual toggle, feature comparison,
 * and FAQ section. Fetches pricing data from API for accurate, up-to-date information.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { IconCheck, IconSparkles, IconRocket, IconCrown } from "@tabler/icons-react";
import Link from "next/link";
import { motion } from "framer-motion";

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

const tierIcons: Record<string, React.ReactNode> = {
  free: <IconSparkles className="h-6 w-6" />,
  plus: <IconRocket className="h-6 w-6" />,
  unlimited: <IconCrown className="h-6 w-6" />,
};

/** Fallback when API is unreachable (e.g. backend not running) */
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
    description: "For working actors and students",
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
    question: "Is there a student discount?",
    answer: "The annual plan offers 31% savings, which is perfect for students on a budget. We're also exploring institutional plans for drama schools. Contact us for more info!"
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
            className="w-full text-left py-4 px-6 bg-muted/30 hover:bg-muted/50 transition-colors rounded-lg"
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
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const apiUrl =
      typeof window !== "undefined"
        ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        : "";
    const url = apiUrl ? `${apiUrl}/api/pricing/tiers` : "";

    if (!url) {
      setTiers(DEFAULT_TIERS);
      setIsLoading(false);
      return;
    }

    fetch(url)
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
      });
  }, []);

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`;
  };

  const calculateSavings = (monthly: number, annual: number) => {
    const monthlyCost = monthly * 12;
    const savings = monthlyCost - annual;
    const percentOff = Math.round((savings / monthlyCost) * 100);
    return { savings, percentOff };
  };

  const getFeaturesList = (tier: PricingTier) => {
    const features = [];

    // AI Searches
    if (tier.features.ai_searches_per_month === -1) {
      features.push("Unlimited AI searches");
    } else {
      features.push(`${tier.features.ai_searches_per_month} AI searches/month`);
    }

    // Bookmarks
    if (tier.features.bookmarks_limit === -1) {
      features.push("Unlimited bookmarks");
    } else {
      features.push(`Up to ${tier.features.bookmarks_limit} bookmarks`);
    }

    // Recommendations
    if (tier.features.recommendations) {
      features.push("Personalized recommendations");
    } else {
      features.push("Basic browsing");
    }

    // Download formats
    features.push(`Download as ${tier.features.download_formats.join(", ").toUpperCase()}`);

    // ScenePartner
    if (tier.features.scene_partner_sessions) {
      features.push(`${tier.features.scene_partner_sessions} ScenePartner AI sessions/month`);
    }

    // CraftCoach
    if (tier.features.craft_coach_sessions) {
      features.push(`${tier.features.craft_coach_sessions} CraftCoach feedback sessions/month`);
    }

    // Advanced Analytics
    if (tier.features.advanced_analytics) {
      features.push("Advanced analytics & insights");
    }

    // Collections
    if (tier.features.collections) {
      features.push("Collections & organization");
    }

    // Collaboration
    if (tier.features.collaboration) {
      features.push("Share collections with others");
    }

    // White label
    if (tier.features.white_label_export) {
      features.push("White-label export (no branding)");
    }

    // Support
    if (tier.features.priority_support) {
      features.push("Priority email support");
    } else {
      features.push("Community support");
    }

    return features;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-7xl">
        <Skeleton className="h-12 w-64 mb-8 mx-auto" />
        <div className="grid md:grid-cols-3 gap-8">
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
          Choose Your Plan
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl text-muted-foreground max-w-2xl mx-auto"
        >
          Start free, upgrade when you're ready. All plans include access to our monologue
          database.
        </motion.p>

        {/* Annual/Monthly Toggle */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-4 mt-8"
        >
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
          {isAnnual && (
            <span className="ml-2 text-xs text-muted-foreground">Save up to 31%</span>
          )}
        </motion.div>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8 mb-16 items-stretch">
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

          return (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="h-full"
            >
              <Card
                className={`h-full flex flex-col relative border border-border/50 shadow-none ${
                  isHighlighted ? "bg-muted/40" : "bg-muted/20"
                }`}
              >
                {isHighlighted && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Most popular
                    </span>
                  </div>
                )}

                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    {tierIcons[tier.name]}
                    <CardTitle className="text-2xl">{tier.display_name}</CardTitle>
                  </div>
                  <CardDescription>{tier.description}</CardDescription>

                  <div className="mt-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{formatPrice(price)}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    {isAnnual && tier.annual_price_cents && tier.annual_price_cents > 0 && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Billed annually at {formatPrice(tier.annual_price_cents)}
                      </p>
                    )}
                    {isAnnual && savings && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Save {formatPrice(savings.savings)}/year
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <IconCheck className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="mt-auto">
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    <Link
                      href={
                        tier.name === "free"
                          ? "/signup"
                          : `/checkout?tier=${tier.name}&period=${isAnnual ? "annual" : "monthly"}`
                      }
                    >
                      {tier.name === "free" ? "Get Started" : "Subscribe"}
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
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
