"use client";

/**
 * Checkout Page
 *
 * Displays order summary and redirects to Stripe Checkout.
 * Parses tier and billing period from URL query params.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSubscription } from "@/hooks/useSubscription";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { IconArrowLeft, IconX } from "@tabler/icons-react";
import api, { API_URL } from "@/lib/api";
import Link from "next/link";
import { RequestPromoCodeModal } from "@/components/contact/RequestPromoCodeModal";
import { trackBeginCheckout, getGaClientId } from "@/lib/analytics";
import { theatreFontVars } from "@/lib/fonts/theatre";

/* The (platform) layout binds no theatre surface, so the page carries the
   tokens and the three faces itself. Without both, every --t-* below resolves
   to nothing and the font-family declarations are dropped whole. */
const shell = `t-box-office theatre-tokens ${theatreFontVars} container mx-auto max-w-2xl px-4 py-16`;

interface PricingTier {
  id: number;
  name: string;
  display_name: string;
  description: string;
  monthly_price_cents: number;
  annual_price_cents: number | null;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className={shell}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-11 w-72" />
        <Skeleton className="mt-7 h-[26rem]" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tier, setTier] = useState<PricingTier | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoShake, setPromoShake] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [promoModalContext, setPromoModalContext] = useState<"review" | null>(null);

  const tierName = searchParams.get("tier");
  const period = searchParams.get("period") || "monthly";
  const { subscription } = useSubscription();
  // Free trial: first-time Plus members get 14 days free ($0 today). Explicit
  // ?trial=1 (or legacy ?promo=FOUNDER3) forces it; otherwise a first-time Plus
  // monthly checkout defaults to the trial. Returning subscribers (already have a
  // Stripe customer) pay as normal, and ?trial=0 is an escape hatch to pay now.
  const explicitTrial =
    searchParams.get("trial") === "1" ||
    (searchParams.get("promo") || "").toUpperCase() === "FOUNDER3";
  const trialEligible =
    tier?.name === "plus" &&
    period === "monthly" &&
    !subscription?.has_stripe_customer;
  const isTrial =
    searchParams.get("trial") === "0" ? false : explicitTrial || trialEligible;

  useEffect(() => {
    if (!tierName) {
      router.push("/pricing");
      return;
    }

    fetch(`${API_URL}/api/pricing/tiers/${tierName}`)
      .then((res) => res.json())
      .then((data) => {
        setTier(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch tier:", err);
        setError("Failed to load pricing information. Please try again.");
        setIsLoading(false);
      });
  }, [tierName, router]);

  // A ?promo= on the URL is auto-applied once the tier has loaded. FOUNDER3 is
  // skipped here on purpose: it is retired, and an old link carrying it is
  // routed to the free trial above rather than failing as a bad coupon.
  useEffect(() => {
    const p = searchParams.get("promo");
    if (p && p.toUpperCase() !== "FOUNDER3" && tier && !promoApplied) {
      applyPromo(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  const applyPromo = (rawCode?: string) => {
    const code = (rawCode ?? promoCode).trim().toUpperCase();
    if (rawCode) setPromoCode(code);
    const triggerShake = (msg: string) => {
      setPromoApplied(null);
      setPromoError(msg);
      setPromoShake(true);
      setTimeout(() => setPromoShake(false), 500);
    };

    // These codes are retired. The list stays so an old link or a remembered
    // code gets a straight answer instead of "invalid coupon", but nothing in
    // the product offers them any more.
    //
    // The message used to promise a 3-month trial. The trial has been 14 days
    // since the founder-era link was retired, so it was quoting an offer that
    // no longer exists to someone already holding a dead code.
    if (["FOUNDER", "FOUNDER3", "FOUNDER6", "FOUNDER12"].includes(code)) {
      triggerShake("That code has retired. Start the 2-week free trial instead.");
    } else if (code === "STXQ5NU4" || code === "STUDENT50") {
      // Retired 2026-09-16. Students no longer get a percentage off; schools and
      // studios come in as an organisation and I open Plus for the class. Kept
      // in the list so a remembered code gets an answer and a next step rather
      // than "invalid coupon".
      triggerShake(
        "That code has retired. If you're with a school or a studio, email canberk@actorrise.com and I'll set your class up.",
      );
    } else if (code === "STARTUPS" || code === "STARTUPS24") {
      setPromoApplied("STARTUPS");
      setPromoError(null);
    } else if (code === "BUSINESS" || code === "ACTINGTEACHER26") {
      setPromoApplied("BUSINESS");
      setPromoError(null);
    } else if (code === "STUDENT" || code === "STUDENTACTOR26") {
      setPromoApplied("STUDENT");
      setPromoError(null);
    } else if (code) {
      triggerShake("Invalid promo code.");
    } else {
      setPromoApplied(null);
      setPromoError(null);
    }
  };

  const removePromo = () => {
    setPromoCode("");
    setPromoApplied(null);
    setPromoError(null);
  };

  const handleCheckout = async () => {
    if (!tier) return;

    setIsCheckingOut(true);
    setError(null);

    // Fired before the redirect, not after. Once we hand off to Stripe this page
    // is gone, so anything sent later never lands.
    trackBeginCheckout({
      tier: tier.name,
      billing_period: period,
      trial: isTrial,
      entry_point: searchParams.get("from") || document.referrer || "direct",
      value:
        (period === "annual" && tier.annual_price_cents != null
          ? tier.annual_price_cents
          : tier.monthly_price_cents) / 100,
      currency: "USD",
    });

    try {
      const response = await api.post<{ checkout_url: string }>(
        "/api/subscriptions/create-checkout-session",
        {
          tier_id: tier.id,
          billing_period: period,
          success_url: `${window.location.origin}/billing/success`,
          cancel_url: `${window.location.origin}/pricing`,
          trial: isTrial,
          promo_code: isTrial ? undefined : promoApplied || undefined,
          // Rides through Stripe metadata so the webhook can fire trial_started
          // against this same GA4 user rather than an anonymous new one.
          ga_client_id: getGaClientId() ?? undefined,
        }
      );

      // Redirect to Stripe Checkout
      window.location.href = response.data.checkout_url;
    } catch (err: unknown) {
      console.error("Failed to create checkout session:", err);
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(detail || "Failed to start checkout. Please try again.");
      setIsCheckingOut(false);
    }
  };

  const getPrice = () => {
    if (!tier) return 0;
    if (isTrial) return 0;
    if (promoApplied === "BUSINESS" || promoApplied === "STUDENT") return 0;
    const base =
      period === "annual" && tier.annual_price_cents
        ? tier.annual_price_cents
        : tier.monthly_price_cents;
    if (promoApplied === "STARTUPS") return Math.round(base * 0.5);
    return base;
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const calculateMonthlyPrice = () => {
    if (!tier) return "$0";
    if (isTrial) return `$${(tier.monthly_price_cents / 100).toFixed(2)}/month after trial`;
    const price = getPrice();
    if (period === "annual" && tier.annual_price_cents) {
      return `$${(price / 12 / 100).toFixed(2)}/month`;
    }
    return `$${(price / 100).toFixed(2)}/month`;
  };

  if (isLoading) {
    return (
      <div className={shell}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-11 w-72" />
        <Skeleton className="mt-7 h-[26rem]" />
      </div>
    );
  }

  if (!tier || error) {
    return (
      <div className={shell}>
        <p className="t-box-office__dir">(the house is dark.)</p>
        <h1 className="t-box-office__title">Something went wrong.</h1>
        <div className="t-ticket">
          <p className="t-ticket__blurb">
            {error || "I couldn't load the checkout information."}
          </p>
          <div className="t-ticket__foot">
            <Link href="/pricing" className="t-ticket__cta">
              <IconArrowLeft className="h-4 w-4" />
              Back to pricing
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <p className="t-box-office__dir">(the box office.)</p>
      <h1 className="t-box-office__title">
        {isTrial ? (
          <>
            Two weeks, <em>on me.</em>
          </>
        ) : (
          <>
            Your seat, <em>held.</em>
          </>
        )}
      </h1>

      <div className="t-ticket">
        <div className="t-ticket__head">
          <h2 className="t-ticket__plan">{tier.display_name}</h2>
          <span className="t-ticket__tag">{period}</span>
        </div>
        <p className="t-ticket__blurb">{tier.description}</p>

        <hr className="t-ticket__rule" />

        <div className="t-ticket__row">
          <span className="t-ticket__label">Billing</span>
          <span className="t-ticket__lead" aria-hidden />
          <span className="t-ticket__val capitalize">{period}</span>
        </div>
        <div className="t-ticket__row">
          <span className="t-ticket__label">Rate</span>
          <span className="t-ticket__lead" aria-hidden />
          <span className="t-ticket__val">{calculateMonthlyPrice()}</span>
        </div>
        <div className="t-ticket__row">
          <span className="t-ticket__label">Due today</span>
          <span className="t-ticket__lead" aria-hidden />
          <span className="t-ticket__total">{formatPrice(getPrice())}</span>
        </div>

        {period === "annual" &&
          promoApplied !== "BUSINESS" &&
          promoApplied !== "STUDENT" && (
            <div className="t-ticket__note">
              <p className="t-ticket__note-title">
                Saves{" "}
                {formatPrice(
                  tier.monthly_price_cents * 12 - (tier.annual_price_cents || 0),
                )}{" "}
                on the year
              </p>
              <p className="t-ticket__note-body">
                31% off the month-to-month rate.
              </p>
            </div>
          )}

        {isTrial && (
          <div className="t-ticket__note">
            <p className="t-ticket__note-title">Nothing is charged today.</p>
            <p className="t-ticket__note-body">
              Card on file, $0 for 14 days, then $12/month. Cancel any time
              before it renews and you are never billed.
            </p>
          </div>
        )}

        {/* Promo / discount codes — hidden on the free trial (no code needed). */}
        {!isTrial && (
          <div className="mt-5 flex flex-col gap-3">
            {promoApplied ? (
              <div className="t-ticket__note flex items-center justify-between gap-3">
                <p className="t-ticket__note-title">
                  {promoApplied === "BUSINESS"
                    ? "BUSINESS applied. 100% off for 3 months."
                    : promoApplied === "STUDENT"
                      ? "STUDENT applied. 100% off for 6 months."
                      : "STARTUPS applied. 50% off."}
                </p>
                <button
                  type="button"
                  onClick={removePromo}
                  className="t-ticket__quiet shrink-0 no-underline"
                  aria-label="Remove code"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className={`flex gap-2${promoShake ? " animate-shake" : ""}`}>
                  <Input
                    placeholder="Promo code"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      setPromoError(null);
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.preventDefault(), applyPromo())
                    }
                    className="h-11 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => applyPromo()}
                    className="t-ticket__cta"
                    style={{ height: 44, padding: "0 20px", fontSize: 14 }}
                  >
                    Apply
                  </button>
                </div>
                {promoError && (
                  <div className="t-ticket__note t-ticket__note--bad">
                    <p className="t-ticket__note-title">{promoError}</p>
                  </div>
                )}

                {tier?.name === "plus" && (
                  <div className="t-ticket__note">
                    <p className="t-ticket__note-title">
                      First time on Plus? Take two weeks free.
                    </p>
                    <p className="t-ticket__note-body">
                      Card required, nothing charged for 14 days, then $12/month.
                    </p>
                    <Link
                      href="/checkout?tier=plus&period=monthly&trial=1"
                      className="t-ticket__cta mt-3"
                      style={{ height: 40, padding: "0 18px", fontSize: 14 }}
                    >
                      Start 2 weeks free
                    </Link>
                  </div>
                )}

                <div className="t-ticket__note">
                  <p className="t-ticket__note-title">
                    Student, teacher, school or coach?
                  </p>
                  <p className="t-ticket__note-body">
                    Tell me who you are and I&apos;ll sort you out. Students get
                    a discount; teachers, schools and coaches get a rate of their
                    own.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPromoModalContext(null);
                      setPromoModalOpen(true);
                    }}
                    className="t-ticket__cta mt-3"
                    style={{ height: 40, padding: "0 18px", fontSize: 14 }}
                  >
                    Ask for a rate
                  </button>
                </div>

                <p className="t-ticket__fine">
                  No code yet?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setPromoModalContext("review");
                      setPromoModalOpen(true);
                    }}
                    className="t-ticket__quiet"
                  >
                    ask me for one
                  </button>
                  , and I&apos;ll get back to you.
                </p>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="t-ticket__note t-ticket__note--bad">
            <p className="t-ticket__note-title">{error}</p>
          </div>
        )}

        <div className="t-ticket__foot">
          <button
            type="button"
            onClick={handleCheckout}
            disabled={isCheckingOut}
            className="t-ticket__cta"
          >
            {isCheckingOut
              ? "Taking you to Stripe..."
              : isTrial
                ? "Start 2 weeks free"
                : "Continue to payment"}
          </button>
          <Link href="/pricing" className="t-ticket__quiet">
            back to the plans
          </Link>
        </div>

        <ul className="t-ticket__fine">
          <li>Cancel any time from billing settings.</li>
          <li>Payment is handled by Stripe. The card never touches my server.</li>
          <li>Renews automatically until you cancel.</li>
        </ul>
      </div>

      <p className="t-ticket__fine" style={{ marginTop: 20 }}>
        Subscribing means you agree to the{" "}
        <Link href="/terms" className="t-ticket__quiet">
          terms
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="t-ticket__quiet">
          privacy policy
        </Link>
        .
      </p>

      <RequestPromoCodeModal
        open={promoModalOpen}
        onOpenChange={(open) => {
          setPromoModalOpen(open);
          if (!open) setPromoModalContext(null);
        }}
        initialType={promoModalContext === "review" ? "student" : undefined}
        initialContext={promoModalContext === "review" ? "review" : undefined}
      />
    </div>
  );
}
