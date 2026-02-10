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
} from "@tabler/icons-react";
import api from "@/lib/api";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSubscription, useUsageLimits, useBillingHistory } from "@/hooks/useSubscription";

export default function BillingPage() {
  const { user } = useAuth();
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);

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
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 text-center">
          <p className="text-lg font-semibold mb-2">Unable to load billing information</p>
          <p className="text-muted-foreground mb-4">
            There was an error loading your subscription data. Please try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Skeleton className="h-12 w-64 mb-8" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <h1 className="text-3xl font-bold mb-2 text-foreground">Billing</h1>
        <p className="text-muted-foreground text-sm">
          Manage your plan and see usage.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Current Plan Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>Current Plan</CardTitle>
                <Badge
                  variant={subscription?.tier_name === "free" ? "outline" : "default"}
                  className="gap-1"
                >
                  {getTierIcon(subscription?.tier_name || "free")}
                  {subscription?.tier_display_name}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {subscription?.tier_name !== "free" && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Billing period</p>
                    <p className="font-medium capitalize text-foreground">{subscription?.billing_period}</p>
                  </div>

                  {subscription?.current_period_end && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
                        {subscription.cancel_at_period_end ? "Ends" : "Renews"}
                      </p>
                      <p className="font-medium text-foreground">{formatDate(subscription.current_period_end)}</p>
                    </div>
                  )}

                  {subscription?.cancel_at_period_end && (
                    <Badge variant="secondary" className="rounded-lg">
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
            <CardFooter className="flex gap-2 pt-2">
              {subscription?.tier_name === "free" ? (
                <Button asChild className="w-full">
                  <Link href="/pricing">
                    <IconSparkles className="h-4 w-4" />
                    Upgrade Plan
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={handleManageSubscription}
                  disabled={isManagingSubscription}
                  variant="outline"
                  className="w-full"
                >
                  <IconCreditCard className="h-4 w-4" />
                  Manage Subscription
                </Button>
              )}
            </CardFooter>
          </Card>
        </motion.div>

        {/* Usage Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-foreground">Usage this month</CardTitle>
              <CardDescription className="text-xs">Resets on the 1st</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* AI Searches */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">AI Searches</span>
                  <span className="text-sm text-muted-foreground">
                    {usage?.ai_searches_used} /{" "}
                    {usage?.ai_searches_limit === -1 ? "∞" : usage?.ai_searches_limit}
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

              {/* Scene Partner (if applicable) */}
              {usage && usage.scene_partner_limit > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">ScenePartner Sessions</span>
                    <span className="text-sm text-muted-foreground">
                      {usage.scene_partner_used} / {usage.scene_partner_limit}
                    </span>
                  </div>
                  <Progress
                    value={getUsagePercentage(usage.scene_partner_used, usage.scene_partner_limit)}
                    className="h-2"
                  />
                </div>
              )}

              {/* CraftCoach (if applicable) */}
              {usage && usage.craft_coach_limit > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">CraftCoach Sessions</span>
                    <span className="text-sm text-muted-foreground">
                      {usage.craft_coach_used} / {usage.craft_coach_limit}
                    </span>
                  </div>
                  <Progress
                    value={getUsagePercentage(usage.craft_coach_used, usage.craft_coach_limit)}
                    className="h-2"
                  />
                </div>
              )}

              {/* Upgrade prompt if usage is high */}
              {usage &&
                usage.ai_searches_limit !== -1 &&
                getUsagePercentage(usage.ai_searches_used, usage.ai_searches_limit) > 80 && (
                  <div className="bg-accent/10 border border-accent/20 rounded-xl p-4">
                    <p className="text-sm font-medium text-foreground mb-1">Running low on searches</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {Math.round(
                        getUsagePercentage(usage.ai_searches_used, usage.ai_searches_limit)
                      )}
                      % used this month.
                    </p>
                    <Button asChild size="sm" variant="outline" className="rounded-full">
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
      </div>

      {/* Billing History */}
      {billingHistory.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-foreground">Billing history</CardTitle>
              <CardDescription className="text-xs">Invoices and payments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {billingHistory.map((item, index) => (
                  <div key={item.id}>
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-foreground text-sm">{item.description || "Payment"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(item.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-semibold text-foreground tabular-nums">{formatPrice(item.amount_cents)}</p>
                        <Badge
                          variant={
                            item.status === "succeeded"
                              ? "default"
                              : item.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                          className="rounded-md text-[10px] uppercase"
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
                    {index < billingHistory.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
