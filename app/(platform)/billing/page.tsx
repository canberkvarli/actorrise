"use client";

/**
 * Billing Dashboard Page
 *
 * Shows user's current subscription, usage metrics, and billing history.
 * Allows users to manage their subscription via Stripe Customer Portal.
 */

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconSparkles,
  IconCreditCard,
  IconDownload,
  IconArrowUpRight,
  IconRocket,
  IconCrown,
  IconGift,
  IconSearch,
  IconBookmark,
  IconScript,
  IconUpload,
  IconMicrophone,
} from "@tabler/icons-react";
import api from "@/lib/api";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSubscription, useUsageLimits, useBillingHistory } from "@/hooks/useSubscription";
import { RequestPromoCodeModal } from "@/components/contact/RequestPromoCodeModal";

export default function BillingPage() {
  const { user } = useAuth();
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);

  // Use SWR hooks for cached data - no more manual fetching!
  const { subscription, isLoading: subLoading, isError: subError } = useSubscription();
  const { usage, isLoading: usageLoading } = useUsageLimits();
  const { history: billingHistory, isLoading: historyLoading } = useBillingHistory();

  const isLoading = subLoading || usageLoading || historyLoading;

  const handleManageSubscription = async () => {
    setIsManagingSubscription(true);
    try {
      const response = await api.post<{ portal_url: string }>(
        "/api/subscriptions/create-portal-session"
      );
      window.location.href = response.data.portal_url;
    } catch (error: any) {
      console.error("Failed to create portal session:", error);
      // Show user-friendly error message
      const errorMessage = error?.response?.data?.detail || "Unable to open subscription management. Please contact support.";
      alert(errorMessage);
      setIsManagingSubscription(false);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0; // Unlimited
    return Math.min((used / limit) * 100, 100);
  };

  const getTierIcon = (tierName: string) => {
    switch (tierName) {
      case "pro":
        return <IconRocket className="h-5 w-5" />;
      case "elite":
        return <IconCrown className="h-5 w-5" />;
      default:
        return <IconSparkles className="h-5 w-5" />;
    }
  };

  // Show error state if subscription fetch fails
  if (subError) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-5 text-center">
          <p className="font-semibold mb-2">Unable to load billing information</p>
          <p className="text-sm text-muted-foreground mb-4">
            There was an error loading your subscription data. Please try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline" size="sm">
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-44 mb-5" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-lg">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage your plan and usage.
        </p>
      </motion.div>

      <div className="space-y-5">
        {/* Current Plan Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="rounded-xl overflow-hidden">
            <CardHeader className="py-4 px-5">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">Current Plan</CardTitle>
                <Badge
                  variant={subscription?.tier_name === "free" ? "outline" : "default"}
                  className="gap-1.5 shrink-0 text-xs"
                >
                  {getTierIcon(subscription?.tier_name || "free")}
                  {subscription?.tier_display_name}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4 pt-0 space-y-3">
              {subscription?.tier_name !== "free" && (
                <>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Billing</p>
                      <p className="font-medium capitalize">{subscription?.billing_period}</p>
                    </div>
                    {subscription?.current_period_end && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">
                          {subscription.cancel_at_period_end ? "Ends" : "Renews"}
                        </p>
                        <p className="font-medium">{formatDate(subscription.current_period_end)}</p>
                      </div>
                    )}
                  </div>
                  {subscription?.cancel_at_period_end && (
                    <Badge variant="secondary" className="rounded-md text-xs">
                      Cancels at period end
                    </Badge>
                  )}
                </>
              )}

              {subscription?.tier_name === "free" && (
                <p className="text-sm text-muted-foreground">
                  Free plan. Upgrade for unlimited searches and bookmarks.
                </p>
              )}
            </CardContent>
            <CardFooter className="px-5 py-4 pt-0 border-t-0 flex-col items-start gap-3">
              {subscription?.tier_name === "free" ? (
                <Button asChild size="sm" className="gap-2 w-fit">
                  <Link href="/pricing">
                    <IconSparkles className="h-4 w-4" />
                    Upgrade Plan
                  </Link>
                </Button>
              ) : subscription?.has_stripe_customer ? (
                <Button
                  onClick={handleManageSubscription}
                  disabled={isManagingSubscription}
                  variant="outline"
                  size="sm"
                  className="gap-2 w-fit"
                >
                  <IconCreditCard className="h-4 w-4" />
                  Manage Subscription
                </Button>
              ) : (
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">You have access to <strong>{subscription?.tier_display_name}</strong> features.</p>
                  <p className="text-xs">To manage billing, contact support or <Link href="/pricing" className="text-primary hover:underline">upgrade your plan</Link>.</p>
                </div>
              )}
            </CardFooter>
          </Card>
        </motion.div>

        {/* Plan Quotas Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <Card className="rounded-xl overflow-hidden">
            <CardHeader className="py-4 px-5">
              <CardTitle className="text-lg text-foreground">What&apos;s Included</CardTitle>
              <CardDescription className="text-xs">
                {subscription?.tier_name === "free"
                  ? "Your free plan includes"
                  : subscription?.tier_name === "plus"
                  ? "Your Plus plan includes"
                  : "Your Unlimited plan includes"}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-0">
              <div className="space-y-3">
                {(() => {
                  const tier = subscription?.tier_name ?? "free";
                  const quotas = tier === "unlimited"
                    ? [
                        { icon: IconSearch, label: "AI Searches", value: "Unlimited", desc: "per month" },
                        { icon: IconBookmark, label: "Bookmarks", value: "Unlimited", desc: "" },
                        { icon: IconScript, label: "Scripts", value: "Unlimited", desc: "" },
                        { icon: IconMicrophone, label: "ScenePartner Sessions", value: "100", desc: "per month" },
                        { icon: IconUpload, label: "Script Uploads", value: "Unlimited", desc: "" },
                      ]
                    : tier === "plus"
                    ? [
                        { icon: IconSearch, label: "AI Searches", value: "150", desc: "per month" },
                        { icon: IconBookmark, label: "Bookmarks", value: "Unlimited", desc: "" },
                        { icon: IconScript, label: "Scripts", value: "10", desc: "" },
                        { icon: IconMicrophone, label: "ScenePartner Sessions", value: "30", desc: "per month" },
                        { icon: IconUpload, label: "Script Uploads", value: "10", desc: "" },
                      ]
                    : [
                        { icon: IconSearch, label: "AI Searches", value: "10", desc: "per month" },
                        { icon: IconBookmark, label: "Bookmarks", value: "5", desc: "" },
                        { icon: IconScript, label: "Scripts", value: "3", desc: "" },
                        { icon: IconMicrophone, label: "ScenePartner Sessions", value: "1", desc: "trial" },
                        { icon: IconUpload, label: "Script Uploads", value: "—", desc: "upgrade required" },
                      ];
                  return quotas.map(({ icon: Icon, label, value, desc }) => (
                    <div key={label} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1">{label}</span>
                      <span className="text-sm font-semibold tabular-nums">{value}</span>
                      {desc && (
                        <span className="text-xs text-muted-foreground w-16 text-right">{desc}</span>
                      )}
                    </div>
                  ));
                })()}
              </div>
              {subscription?.tier_name === "free" && (
                <div className="mt-4 pt-3 border-t border-border/60">
                  <p className="text-xs text-muted-foreground">
                    Upgrade to Plus for more searches, scripts, and full ScenePartner access.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Usage Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="rounded-xl overflow-hidden">
            <CardHeader className="py-4 px-5">
              <CardTitle className="text-lg text-foreground">Usage this month</CardTitle>
              <CardDescription className="text-xs">Resets on the 1st</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-0 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="font-medium">AI Searches</span>
                  <span className="text-muted-foreground tabular-nums">
                    {usage?.ai_searches_used} / {usage?.ai_searches_limit === -1 ? "∞" : usage?.ai_searches_limit}
                  </span>
                </div>
                <Progress
                  value={getUsagePercentage(
                    usage?.ai_searches_used || 0,
                    usage?.ai_searches_limit || 0
                  )}
                  className="h-2"
                />
              </div>

              {usage && usage.scene_partner_limit > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="font-medium">ScenePartner</span>
                    <span className="text-muted-foreground tabular-nums">
                      {usage.scene_partner_used} / {usage.scene_partner_limit}
                    </span>
                  </div>
                  <Progress
                    value={getUsagePercentage(usage.scene_partner_used, usage.scene_partner_limit)}
                    className="h-2"
                  />
                </div>
              )}

              {usage && usage.craft_coach_limit > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="font-medium">Craft Coach</span>
                    <span className="text-muted-foreground tabular-nums">
                      {usage.craft_coach_used} / {usage.craft_coach_limit}
                    </span>
                  </div>
                  <Progress
                    value={getUsagePercentage(usage.craft_coach_used, usage.craft_coach_limit)}
                    className="h-2"
                  />
                </div>
              )}

              {usage &&
                usage.ai_searches_limit !== -1 &&
                getUsagePercentage(usage.ai_searches_used, usage.ai_searches_limit) > 80 && (
                  <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Running low on searches</p>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(
                          getUsagePercentage(usage.ai_searches_used, usage.ai_searches_limit)
                        )}% used
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline" className="rounded-full shrink-0">
                      <Link href="/pricing">
                        Upgrade
                        <IconArrowUpRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Request a discount */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">
                Student or teacher / school / coach?
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                Request a discount; we&apos;ll email you a code.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => setPromoModalOpen(true)}
            >
              <IconGift className="h-4 w-4" />
              Request a discount
            </Button>
          </div>
        </motion.div>

        {/* Billing History */}
        {billingHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="rounded-xl overflow-hidden">
              <CardHeader className="py-4 px-5">
                <CardTitle className="text-lg text-foreground">Billing history</CardTitle>
                <CardDescription className="text-xs">Invoices and payments</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-0">
                <div className="divide-y divide-border/60">
                  {billingHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.description || "Payment"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(item.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-sm font-semibold tabular-nums">{formatPrice(item.amount_cents)}</p>
                        <Badge
                          variant={
                            item.status === "succeeded"
                              ? "default"
                              : item.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                          className="rounded-md text-xs uppercase px-2"
                        >
                          {item.status}
                        </Badge>
                        {item.invoice_url && (
                          <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <a href={item.invoice_url} target="_blank" rel="noopener noreferrer" title="Download invoice">
                              <IconDownload className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      <RequestPromoCodeModal open={promoModalOpen} onOpenChange={setPromoModalOpen} />
    </div>
  );
}
