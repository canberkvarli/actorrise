"use client";

/**
 * Subscription Success Page
 *
 * Shown after successful payment. Confirms subscription and provides next steps.
 */

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconCheck, IconArrowRight, IconSparkles } from "@tabler/icons-react";
import api from "@/lib/api";
import Link from "next/link";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n";

interface SubscriptionData {
  tier_name: string;
  tier_display_name: string;
  status: string;
  billing_period: string;
}

export default function SuccessPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const t = useT();
  const period = subscription?.billing_period;
  const periodLabel =
    period === "annual"
      ? t("appAccountBilling.periodAnnual")
      : period === "yearly"
        ? t("appAccountBilling.periodYearly")
        : period === "monthly"
          ? t("appAccountBilling.periodMonthly")
          : period;

  useEffect(() => {
    // Fetch updated subscription (may take a moment for webhook to process)
    const fetchSubscription = async () => {
      try {
        // Wait a bit for webhook to process
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const response = await api.get<SubscriptionData>("/api/subscriptions/me");
        setSubscription(response.data);
      } catch (error) {
        console.error("Failed to fetch subscription:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscription();
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Skeleton className="h-12 w-64 mb-8 mx-auto" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <IconCheck className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-brand font-semibold text-4xl mb-2">
          {t("appAccountSuccess.welcome", { plan: subscription?.tier_display_name ?? "" })}
        </h1>
        <p className="text-xl text-muted-foreground">{t("appAccountSuccess.active")}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("appAccountSuccess.details")}</CardTitle>
              <Badge variant="default">{subscription?.tier_display_name}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t("appAccountSuccess.plan")}</p>
                <p className="font-medium">{subscription?.tier_display_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t("appAccountCheckout.billing")}</p>
                <p className="font-medium capitalize">{periodLabel}</p>
              </div>
            </div>

            <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <IconSparkles className="h-4 w-4 text-accent" />
                {t("appAccountSuccess.next")}
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>{t("appAccountSuccess.next1")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>{t("appAccountSuccess.next2")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>{t("appAccountSuccess.next3")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>{t("appAccountSuccess.next4")}</span>
                </li>
                {(subscription?.tier_name === "elite" || subscription?.tier_name === "unlimited") && (
                  <>
                    <li className="flex items-start gap-2">
                      <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>{t("appAccountSuccess.next5")}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      {/* ScenePartner shipped a long time ago — it has its own
                          tab in the nav. Promising it as "coming soon" on the
                          page someone lands on straight after paying is the
                          worst possible place to be out of date. */}
                      <span>{t("appAccountSuccess.next6")}</span>
                    </li>
                  </>
                )}
              </ul>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>• {t("appAccountSuccess.fine1")}</p>
              <p>• {t("appAccountSuccess.fine2")}</p>
              <p>• {t("appAccountSuccess.fine3")}</p>
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/billing">{t("appAccountSuccess.viewBilling")}</Link>
            </Button>
            <Button asChild className="flex-1">
              <Link href="/monologues">
                {t("appAccountSuccess.browse")}
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </motion.div>

      <p className="text-center text-sm text-muted-foreground mt-6">
        {t("appAccountSuccess.questions")}{" "}
        <Link href="/contact" className="underline">
          {t("appAccountSuccess.contact")}
        </Link>
      </p>
    </div>
  );
}
