"use client";

/**
 * Checkout Page
 *
 * Displays order summary and redirects to Stripe Checkout.
 * Parses tier and billing period from URL query params.
 */

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { IconRocket, IconCrown, IconArrowLeft, IconTag, IconX } from "@tabler/icons-react";
import api, { API_URL } from "@/lib/api";
import Link from "next/link";

interface PricingTier {
  id: number;
  name: string;
  display_name: string;
  description: string;
  monthly_price_cents: number;
  annual_price_cents: number | null;
}

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tier, setTier] = useState<PricingTier | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<string | null>(null);

  const tierName = searchParams.get("tier");
  const period = searchParams.get("period") || "monthly";

  useEffect(() => {
    if (!tierName) {
      router.push("/pricing");
      return;
    }

    // Fetch tier details
    fetch(`${API_URL}/api/pricing/tiers/${tierName}`)
      .then((res) => res.json())
      .then((data) => {
        setTier(data);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Failed to fetch tier:", error);
        setError("Failed to load pricing information. Please try again.");
        setIsLoading(false);
      });
  }, [tierName, router]);

  const applyPromo = () => {
    const code = promoCode.trim().toUpperCase();
    if (code === "FOUNDER") {
      setPromoApplied("FOUNDER");
      setError(null);
    } else if (code) {
      setPromoApplied(null);
      setError("Invalid promo code.");
    } else {
      setPromoApplied(null);
      setError(null);
    }
  };

  const removePromo = () => {
    setPromoCode("");
    setPromoApplied(null);
    setError(null);
  };

  const handleCheckout = async () => {
    if (!tier) return;

    setIsCheckingOut(true);
    setError(null);

    try {
      const response = await api.post<{ checkout_url: string }>(
        "/api/subscriptions/create-checkout-session",
        {
          tier_id: tier.id,
          billing_period: period,
          success_url: `${window.location.origin}/billing/success`,
          cancel_url: `${window.location.origin}/pricing`,
          promo_code: promoApplied || undefined,
        }
      );

      // Redirect to Stripe Checkout
      window.location.href = response.data.checkout_url;
    } catch (error: any) {
      console.error("Failed to create checkout session:", error);
      setError(error.response?.data?.detail || "Failed to start checkout. Please try again.");
      setIsCheckingOut(false);
    }
  };

  const getPrice = () => {
    if (!tier) return 0;
    if (promoApplied === "FOUNDER") return 0;
    return period === "annual" && tier.annual_price_cents
      ? tier.annual_price_cents
      : tier.monthly_price_cents;
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const calculateMonthlyPrice = () => {
    if (!tier) return "$0";
    const price = getPrice();
    if (period === "annual" && tier.annual_price_cents) {
      return `$${(tier.annual_price_cents / 12 / 100).toFixed(2)}/month`;
    }
    return `$${(tier.monthly_price_cents / 100).toFixed(2)}/month`;
  };

  const getTierIcon = () => {
    if (tier?.name === "elite") return <IconCrown className="h-6 w-6" />;
    return <IconRocket className="h-6 w-6" />;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Skeleton className="h-12 w-64 mb-8" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!tier || error) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {error || "Unable to load checkout information."}
            </p>
            <Button asChild>
              <Link href="/pricing">
                <IconArrowLeft className="h-4 w-4" />
                Back to Pricing
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Complete Your Subscription</h1>
        <p className="text-muted-foreground">Review your order and proceed to payment</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getTierIcon()}
              <CardTitle className="text-2xl">{tier.display_name} Plan</CardTitle>
            </div>
            <Badge variant="default" className="capitalize">
              {period}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">{tier.description}</p>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Billing period</span>
              <span className="font-medium capitalize">{period}</span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium">{calculateMonthlyPrice()}</span>
            </div>

            {period === "annual" && (
              <>
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Billed today</span>
                  <span className="text-2xl font-bold">{formatPrice(getPrice())}</span>
                </div>
                {promoApplied !== "FOUNDER" && (
                  <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
                    <p className="text-sm font-medium text-accent mb-1">Annual Savings</p>
                    <p className="text-xs text-muted-foreground">
                      Save{" "}
                      {formatPrice(
                        tier.monthly_price_cents * 12 - (tier.annual_price_cents || 0)
                      )}{" "}
                      per year (31% discount)
                    </p>
                  </div>
                )}
              </>
            )}

            {period === "monthly" && (
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Billed today</span>
                <span className="text-2xl font-bold">{formatPrice(getPrice())}</span>
              </div>
            )}

            {/* Promo code */}
            <div className="flex flex-col gap-2 pt-2 border-t">
              {promoApplied ? (
                <div className="flex items-center justify-between rounded-lg bg-accent/10 border border-accent/20 px-3 py-2">
                  <span className="text-sm font-medium text-accent flex items-center gap-2">
                    <IconTag className="h-4 w-4" />
                    {promoApplied} applied — free for 1 year
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={removePromo}>
                    <IconX className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Promo code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyPromo())}
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={applyPromo}>
                    Apply
                  </Button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• You can cancel anytime from your billing settings</p>
            <p>• All payments are secure and encrypted via Stripe</p>
            <p>• Subscription renews automatically unless canceled</p>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button asChild variant="outline" className="flex-1">
            <Link href="/pricing">
              <IconArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button onClick={handleCheckout} disabled={isCheckingOut} className="flex-1">
            {isCheckingOut ? "Redirecting..." : "Continue to Payment"}
          </Button>
        </CardFooter>
      </Card>

      <p className="text-center text-sm text-muted-foreground mt-6">
        By subscribing, you agree to our{" "}
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
