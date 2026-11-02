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
import { PLUS_ANNUAL, PLUS_MONTHLY } from "@/lib/paywall/offer";
import { useLocale, useT } from "@/lib/i18n";
import { capIn, chargeDateIn, moneyIn, useTrialText } from "@/components/billing/trialText";
import { EarnSecondWeek } from "@/components/billing/EarnSecondWeek";
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
/** Set by the tier fetch; said in the reader's language when shown. */
const LOAD_ERROR = "__load_error__";

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
  // A week, or two for an actor who has finished a scene. The server decides
  // and runs it; this page only prints what /me says.
  const words = useTrialText();
  const t = useT();
  const locale = useLocale();
  const shownError = error === LOAD_ERROR ? t("appAccountCheckout.loadError") : error;
  // Free trial: first-time Plus members get it free ($0 today). Explicit
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
  // After the three days of Plus from the read wall there is no trial left;
  // the server refuses one too (subscriptions.create_checkout_session).
  const isTrial =
    words.tasted || searchParams.get("trial") === "0" ? false : explicitTrial || trialEligible;

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
        setError(LOAD_ERROR);
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
    // The message used to promise a 3-month trial, which was quoting an offer
    // that no longer exists to someone already holding a dead code. It names
    // no length now: the trial's length is the server's to say.
    if (["FOUNDER", "FOUNDER3", "FOUNDER6", "FOUNDER12"].includes(code)) {
      triggerShake(t("appAccountCheckout.codeRetired"));
    } else if (code === "STXQ5NU4" || code === "STUDENT50") {
      // Retired 2026-09-16. Students no longer get a percentage off; schools and
      // studios come in as an organisation and I open Plus for the class. Kept
      // in the list so a remembered code gets an answer and a next step rather
      // than "invalid coupon".
      triggerShake(t("appAccountCheckout.codeRetiredSchool"));
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
      triggerShake(t("appAccountCheckout.invalidCode"));
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
      setError(detail || t("appAccountCheckout.startError"));
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

  const formatPrice = (cents: number) => moneyIn(locale, cents);

  const calculateMonthlyPrice = () => {
    if (!tier) return "$0";
    // The trial rolls into the period picked (server side since 2026-10-31).
    if (isTrial && period === "annual" && tier.annual_price_cents)
      return t("appAccountCheckout.yearAfterTrial", { price: formatPrice(tier.annual_price_cents) });
    if (isTrial)
      return t("appAccountCheckout.monthAfterTrial", { price: formatPrice(tier.monthly_price_cents) });
    const price = getPrice();
    if (period === "annual" && tier.annual_price_cents) {
      return t("appAccountCheckout.perMonth", { price: formatPrice(price / 12) });
    }
    return t("appAccountCheckout.perMonth", { price: formatPrice(price) });
  };
  const periodLabel =
    period === "annual"
      ? t("appAccountBilling.periodAnnual")
      : period === "monthly"
        ? t("appAccountBilling.periodMonthly")
        : period;
  const afterTrial =
    period === "annual"
      ? t("appAccountCheckout.thenYear", { annual: PLUS_ANNUAL })
      : t("appAccountCheckout.thenMonth", { monthly: PLUS_MONTHLY });

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
        <p className="t-box-office__dir">{t("appAccountCheckout.darkDirection")}</p>
        <h1 className="t-box-office__title">{t("appAccountCheckout.wrongTitle")}</h1>
        <div className="t-ticket">
          <p className="t-ticket__blurb">
            {shownError || t("appAccountCheckout.wrongBody")}
          </p>
          <div className="t-ticket__foot">
            <Link href="/pricing" className="t-ticket__cta">
              <IconArrowLeft className="h-4 w-4" />
              {t("appAccountCheckout.backToPricing")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <p className="t-box-office__dir">{t("appAccountBilling.direction")}</p>
      <h1 className="t-box-office__title">
        {isTrial ? (
          <>
            {t("appAccountCheckout.trialTitleA", { span: capIn(words.span, locale) })}
            <em>{t("appAccountCheckout.trialTitleB")}</em>
          </>
        ) : (
          <>
            {t("appAccountCheckout.seatTitleA")}
            <em>{t("appAccountCheckout.seatTitleB")}</em>
          </>
        )}
      </h1>

      <div className="t-ticket">
        <div className="t-ticket__head">
          <h2 className="t-ticket__plan">{tier.display_name}</h2>
          <span className="t-ticket__tag">{periodLabel}</span>
        </div>
        <p className="t-ticket__blurb">{tier.description}</p>

        <hr className="t-ticket__rule" />

        <div className="t-ticket__row">
          <span className="t-ticket__label">{t("appAccountCheckout.billing")}</span>
          <span className="t-ticket__lead" aria-hidden />
          <span className="t-ticket__val capitalize">{periodLabel}</span>
        </div>
        <div className="t-ticket__row">
          <span className="t-ticket__label">{t("appAccountCheckout.rate")}</span>
          <span className="t-ticket__lead" aria-hidden />
          <span className="t-ticket__val">{calculateMonthlyPrice()}</span>
        </div>
        <div className="t-ticket__row">
          <span className="t-ticket__label">{t("appAccountCheckout.dueToday")}</span>
          <span className="t-ticket__lead" aria-hidden />
          <span className="t-ticket__total">{formatPrice(getPrice())}</span>
        </div>

        {period === "annual" &&
          promoApplied !== "BUSINESS" &&
          promoApplied !== "STUDENT" && (
            <div className="t-ticket__note">
              <p className="t-ticket__note-title">
                {t("appAccountCheckout.saves", {
                  amount: formatPrice(
                    tier.monthly_price_cents * 12 - (tier.annual_price_cents || 0),
                  ),
                })}
              </p>
              <p className="t-ticket__note-body">
                {t("appAccountCheckout.savesBody", { pct: 31 })}
              </p>
            </div>
          )}

        {isTrial && (
          <div className="t-ticket__note">
            <p className="t-ticket__note-title">{t("appAccountCheckout.nothingToday")}</p>
            <p className="t-ticket__note-body">
              {t("appAccountCheckout.trialNoteA", { days: words.days, then: afterTrial })}
              <span suppressHydrationWarning>{chargeDateIn(locale, new Date(), words.days)}</span>
              {t("appAccountCheckout.trialNoteB")}{" "}
              <EarnSecondWeek />
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
                    ? t("appAccountCheckout.appliedBusiness")
                    : promoApplied === "STUDENT"
                      ? t("appAccountCheckout.appliedStudent")
                      : t("appAccountCheckout.appliedStartups")}
                </p>
                <button
                  type="button"
                  onClick={removePromo}
                  className="t-ticket__quiet shrink-0 no-underline"
                  aria-label={t("appAccountCheckout.removeCode")}
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className={`flex gap-2${promoShake ? " animate-shake" : ""}`}>
                  <Input
                    placeholder={t("appAccountCheckout.promoPlaceholder")}
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
                    {t("appAccountCheckout.apply")}
                  </button>
                </div>
                {promoError && (
                  <div className="t-ticket__note t-ticket__note--bad">
                    <p className="t-ticket__note-title">{promoError}</p>
                  </div>
                )}

                {tier?.name === "plus" && !words.tasted && (
                  <div className="t-ticket__note">
                    <p className="t-ticket__note-title">
                      {t("appAccountCheckout.firstTime", { span: words.span })}
                    </p>
                    <p className="t-ticket__note-body">
                      {t("appAccountCheckout.firstTimeBody", { days: words.days, then: afterTrial })}
                    </p>
                    <Link
                      href={`/checkout?tier=plus&period=${period === "annual" ? "annual" : "monthly"}&trial=1`}
                      className="t-ticket__cta mt-3"
                      style={{ height: 40, padding: "0 18px", fontSize: 14 }}
                    >
                      {words.cta}
                    </Link>
                  </div>
                )}

                <div className="t-ticket__note">
                  <p className="t-ticket__note-title">{t("appAccountCheckout.rateQ")}</p>
                  <p className="t-ticket__note-body">{t("appAccountCheckout.rateBody")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPromoModalContext(null);
                      setPromoModalOpen(true);
                    }}
                    className="t-ticket__cta mt-3"
                    style={{ height: 40, padding: "0 18px", fontSize: 14 }}
                  >
                    {t("appAccountCheckout.askRate")}
                  </button>
                </div>

                {/* A sentence with a control in it: same flex trap as the
                    terms line below, so it takes the note treatment too. */}
                <p className="t-ticket__fine t-ticket__fine--note">
                  {t("appAccountCheckout.noCodeA")}
                  <button
                    type="button"
                    onClick={() => {
                      setPromoModalContext("review");
                      setPromoModalOpen(true);
                    }}
                    className="t-ticket__quiet"
                  >
                    {t("appAccountCheckout.noCodeLink")}
                  </button>
                  {t("appAccountCheckout.noCodeB")}
                </p>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="t-ticket__note t-ticket__note--bad">
            <p className="t-ticket__note-title">{shownError}</p>
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
              ? t("appAccountCheckout.toStripe")
              : isTrial
                ? words.cta
                : t("appAccountCheckout.continue")}
          </button>
          <Link href="/pricing" className="t-ticket__quiet">
            {t("appAccountCheckout.backToPlans")}
          </Link>
        </div>

        <ul className="t-ticket__fine">
          <li>{t("appAccountCheckout.fine1")}</li>
          <li>{t("appAccountCheckout.fine2")}</li>
          <li>{t("appAccountCheckout.fine3")}</li>
        </ul>
      </div>

      <p className="t-ticket__fine t-ticket__fine--note" style={{ marginTop: 20 }}>
        {t("appAccountCheckout.agreeA")}
        <Link href="/terms" className="t-ticket__quiet">
          {t("appAccountCheckout.agreeTerms")}
        </Link>
        {t("appAccountCheckout.agreeB")}
        <Link href="/privacy" className="t-ticket__quiet">
          {t("appAccountCheckout.agreePrivacy")}
        </Link>
        {t("appAccountCheckout.agreeC")}
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
