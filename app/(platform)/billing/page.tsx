"use client";

/**
 * /billing — the box office.
 *
 * Four facts and two actions: what plan am I on, when does it bill, how much
 * have I used, what have I been charged; and let me change it or ask for a
 * discount. It was five shadcn Cards stacked in a 512px column — a ribbon of
 * boxes down the middle of a wide screen, each with a header, a title and a
 * rule of its own, so most of the page was the furniture around the facts.
 *
 * It is a ticket and a ledger now. The stub carries the plan and what the plan
 * admits you to; the ledger beside it carries the meter and the receipts.
 * Styling lives in `.t-stub*` / `.t-bill*` / `.t-leader*` in globals.css.
 */

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  IconArrowUpRight,
  IconCreditCard,
  IconDownload,
  IconGift,
  IconSparkles,
} from "@tabler/icons-react";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { RequestPromoCodeModal } from "@/components/contact/RequestPromoCodeModal";
import {
  useBillingHistory,
  useSubscription,
  useUsageLimits,
  type UsageLimits,
} from "@/hooks/useSubscription";
import { plusHref } from "@/lib/trial";
import { PLUS_MONTHLY } from "@/lib/paywall/offer";
import { useLocale, useT, type Locale, type MessageKey } from "@/lib/i18n";
import { capIn, moneyIn, useTrialText } from "@/components/billing/trialText";

/** What each tier opens. Copy only — the numbers come from the same table the
 *  pricing page quotes, and nothing here is derived from the user's account. */
type OpensLabel = "searches" | "collection" | "scripts" | "scenepartner" | "uploads";
const NO_LIMIT = "noLimit";
const NOT_ON_FREE = "notOnFree";

const WHAT_IT_OPENS: Record<
  string,
  { label: OpensLabel; value: string; unit?: "month" | "toTry"; none?: boolean }[]
> = {
  unlimited: [
    { label: "searches", value: NO_LIMIT },
    { label: "collection", value: NO_LIMIT },
    { label: "scripts", value: NO_LIMIT },
    { label: "scenepartner", value: "100", unit: "month" },
    { label: "uploads", value: NO_LIMIT },
  ],
  plus: [
    { label: "searches", value: "150", unit: "month" },
    { label: "collection", value: NO_LIMIT },
    { label: "scripts", value: "10" },
    { label: "scenepartner", value: "30", unit: "month" },
    { label: "uploads", value: "10" },
  ],
  free: [
    { label: "searches", value: "10", unit: "month" },
    { label: "collection", value: "5" },
    { label: "scripts", value: "3" },
    { label: "scenepartner", value: "1", unit: "toTry" },
    { label: "uploads", value: NOT_ON_FREE, none: true },
  ],
};

const OPENS_LABEL: Record<OpensLabel, MessageKey> = {
  searches: "appAccountBilling.labelSearches",
  collection: "appAccountBilling.labelCollection",
  scripts: "appAccountBilling.labelScripts",
  scenepartner: "appAccountBilling.labelScenePartner",
  uploads: "appAccountBilling.labelUploads",
};

/** API enums shown to the reader. Anything unknown prints as it came. */
const PERIOD_LABEL: Record<string, MessageKey> = {
  monthly: "appAccountBilling.periodMonthly",
  annual: "appAccountBilling.periodAnnual",
  yearly: "appAccountBilling.periodYearly",
};
const STATUS_LABEL: Record<string, MessageKey> = {
  failed: "appAccountBilling.statusFailed",
  pending: "appAccountBilling.statusPending",
  refunded: "appAccountBilling.statusRefunded",
};

export default function BillingPage() {
  useAuth();
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);

  const { subscription, isLoading: subLoading, isError: subError } = useSubscription();
  const { usage, isLoading: usageLoading } = useUsageLimits();
  const { history: billingHistory, isLoading: historyLoading } = useBillingHistory();
  const words = useTrialText();
  const t = useT();
  const locale = useLocale();
  const formatDate = (d: string) => formatDateIn(locale, d);
  const formatPrice = (cents: number) => moneyIn(locale, cents);

  const isLoading = subLoading || usageLoading || historyLoading;

  const handleManageSubscription = async () => {
    setIsManagingSubscription(true);
    try {
      const response = await api.post<{ portal_url: string }>(
        "/api/subscriptions/create-portal-session",
      );
      window.location.href = response.data.portal_url;
    } catch (error: unknown) {
      /* This was a window.alert(), which is the one dialog that cannot be
         styled, cannot be dismissed by tapping away, and blocks the page —
         on the screen where somebody is trying to give us money. */
      const detail =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      toast.error(
        typeof detail === "string"
          ? detail
          : t("appAccountBilling.portalError"),
      );
      setIsManagingSubscription(false);
    }
  };

  const tier = subscription?.tier_name ?? "free";
  const isFree = tier === "free";
  const opens = WHAT_IT_OPENS[tier] ?? WHAT_IT_OPENS.free;

  const shell = `theatre-tokens theatre-stage ${theatreFontVars} container relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8`;

  if (subError) {
    return (
      <div className={shell}>
        <Head />
        <div className="t-bill mt-8 max-w-md">
          <p className="t-bill__head">{t("appAccountBilling.errorHead")}</p>
          <p className="t-stub__terms">{t("appAccountBilling.errorBody")}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="t-bring-in mt-5"
          >
            {t("appAccountBilling.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={shell}>
        <Head />
        {/* Shaped like what is coming. A single centred bar told you nothing
            about the page that was about to appear underneath it. */}
        <div
          aria-hidden
          className="mt-8 grid gap-6 lg:grid-cols-[1.12fr_1fr] lg:gap-8"
        >
          <Skeleton className="h-[420px] rounded-[14px] opacity-40" />
          <div className="space-y-6">
            <Skeleton className="h-[180px] rounded-[14px] opacity-40" />
            <Skeleton className="h-[150px] rounded-[14px] opacity-40" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <Head />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.12fr_1fr] lg:gap-8 lg:items-start">
        {/* --- The stub ---------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="t-stub"
        >
          <div className="t-stub__top">
            <p className="t-stub__rail">
              <span>{t("appAccountBilling.admitOne")}</span>
              <span className="t-stub__serial">
                {subscription?.status === "trialing" ? t("appAccountBilling.onTrial") : " "}
              </span>
            </p>

            <h2 className="t-stub__tier">
              {subscription?.tier_display_name ?? t("appAccountBilling.free")}
            </h2>

            <p className="t-stub__terms">
              {isFree ? (
                <>{t("appAccountBilling.freeTerms")}</>
              ) : (
                <>
                  {subscription?.billing_period
                    ? t("appAccountBilling.billed", {
                        period: labelOf(PERIOD_LABEL, subscription.billing_period, t),
                      })
                    : null}
                  {subscription?.billing_period && subscription?.current_period_end ? " · " : null}
                  {subscription?.current_period_end
                    ? t(
                        subscription.cancel_at_period_end
                          ? "appAccountBilling.endsOn"
                          : "appAccountBilling.renewsOn",
                        { date: formatDate(subscription.current_period_end) },
                      )
                    : null}
                </>
              )}
            </p>

            {subscription?.cancel_at_period_end && (
              <span className="t-stub__ending">{t("appAccountBilling.endsAtPeriod")}</span>
            )}

            <div className="t-stub__actions">
              {isFree ? (
                <>
                  <Link
                    href={plusHref("billing", words.tasted)}
                    className="t-cta t-cta--paper t-cta--stub"
                  >
                    {words.tasted
                      ? t("appAccountBilling.getPlusMonthly", { price: PLUS_MONTHLY })
                      : t("appAccountBilling.spanOfPlusFree", { span: capIn(words.span, locale) })}
                    <span className="t-cta__dot" aria-hidden>
                      <IconGift className="h-4 w-4" />
                    </span>
                  </Link>
                  <Link href="/pricing" className="t-bring-in">
                    <IconSparkles className="h-4 w-4" />
                    {t("appAccountBilling.seePlans")}
                  </Link>
                </>
              ) : subscription?.has_stripe_customer ? (
                <button
                  type="button"
                  onClick={handleManageSubscription}
                  disabled={isManagingSubscription}
                  className="t-bring-in disabled:opacity-60"
                >
                  <IconCreditCard className="h-4 w-4" />
                  {isManagingSubscription
                    ? t("appAccountBilling.opening")
                    : t("appAccountBilling.manage")}
                </button>
              ) : (
                /* Comped accounts have no Stripe customer, so there is no
                   portal to send them to. Saying so is kinder than a button
                   that errors. */
                <p className="t-stub__terms" style={{ marginTop: 0 }}>
                  {t("appAccountBilling.onTheHouse")}{" "}
                  <Link href="/pricing" className="t-note__ask">
                    {t("appAccountBilling.thePlans")}
                  </Link>
                </p>
              )}
            </div>
          </div>

          <div aria-hidden className="t-stub__perf" />

          <div className="t-stub__bottom">
            <p className="t-bill__head">{t("appAccountBilling.whatItOpens")}</p>
            <div className="mt-2">
              {opens.map((row) => (
                <div key={row.label} className="t-leader" data-none={row.none || undefined}>
                  <span>{t(OPENS_LABEL[row.label])}</span>
                  <span aria-hidden className="t-leader__dots" />
                  <span className="t-leader__value">
                    {row.value === NO_LIMIT
                      ? t("appAccountBilling.noLimit")
                      : row.value === NOT_ON_FREE
                        ? t("appAccountBilling.notOnFree")
                        : row.value}
                    {row.unit && (
                      <em>
                        {" "}
                        {t(
                          row.unit === "month"
                            ? "appAccountBilling.unitMonth"
                            : "appAccountBilling.unitToTry",
                        )}
                      </em>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* --- The ledger --------------------------------------------------- */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="t-bill"
          >
            <p className="t-bill__head">
              {t("appAccountBilling.thisMonth")}
              <span className="t-bill__aside">{t("appAccountBilling.resets")}</span>
            </p>

            <div className="mt-4 space-y-4">
              <Meter
                label={t("appAccountBilling.labelSearches")}
                used={usage?.ai_searches_used ?? 0}
                limit={usage?.ai_searches_limit ?? 0}
              />
              {usage && usage.scene_partner_limit > 0 && (
                <Meter
                  label={t("appAccountBilling.labelScenePartner")}
                  used={usage.scene_partner_used}
                  limit={usage.scene_partner_limit}
                />
              )}
              {usage && usage.craft_coach_limit > 0 && (
                <Meter
                  label={t("appAccountBilling.labelCraftCoach")}
                  used={usage.craft_coach_used}
                  limit={usage.craft_coach_limit}
                />
              )}
            </div>

            {usage && runningLow(usage) && (
              <p className="t-note mt-5">
                <span>{t("appAccountBilling.runningLow")}</span>
                <Link href="/pricing" className="t-note__ask">
                  {t("appAccountBilling.moreOfThem")}
                  <IconArrowUpRight className="inline h-3 w-3 align-[-1px]" />
                </Link>
              </p>
            )}
          </motion.div>

          {billingHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="t-bill"
            >
              <p className="t-bill__head">{t("appAccountBilling.receipts")}</p>
              <div className="mt-3">
                {billingHistory.map((item) => (
                  <div key={item.id} className="t-receipt">
                    <span className="t-receipt__what">
                      {item.description || t("appAccountBilling.payment")}
                      <span className="t-receipt__when">
                        {formatDate(item.created_at)}
                        {item.status !== "succeeded"
                          ? ` · ${labelOf(STATUS_LABEL, item.status, t)}`
                          : ""}
                      </span>
                    </span>
                    <span
                      className="t-receipt__sum"
                      data-failed={item.status === "failed" || undefined}
                    >
                      {formatPrice(item.amount_cents)}
                    </span>
                    {item.invoice_url && (
                      <a
                        href={item.invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t("appAccountBilling.invoiceFor", { date: formatDate(item.created_at) })}
                        className="t-receipt__pdf"
                      >
                        <IconDownload className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="t-note px-1"
          >
            <span>{t("appAccountBilling.discountQ")}</span>
            <button type="button" onClick={() => setPromoModalOpen(true)} className="t-note__ask">
              {t("appAccountBilling.discountAsk")}
            </button>
          </motion.p>
        </div>
      </div>

      <RequestPromoCodeModal open={promoModalOpen} onOpenChange={setPromoModalOpen} />
    </div>
  );
}

function Head() {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <p className="t-slug">{t("appAccountBilling.direction")}</p>
      <h1 className="t-stage-title t-boxoffice-title">{t("appAccountBilling.title")}</h1>
    </motion.div>
  );
}

/** One line of the meter. A limit of -1 is "no limit", which has no bar to
 *  draw — a full track would read as "you are out". */
function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const t = useT();
  const unlimited = limit === -1;
  const pct = unlimited || limit <= 0 ? 0 : Math.min((used / limit) * 100, 100);
  return (
    <div>
      <p className="t-meter__row">
        <span>{label}</span>
        <span className="t-meter__count">
          {unlimited
            ? t("appAccountBilling.meterUnlimited", { used })
            : `${used} / ${limit}`}
        </span>
      </p>
      {!unlimited && (
        <div
          className="t-meter"
          role="progressbar"
          aria-label={t("appAccountBilling.meterAria", { label })}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="t-meter__fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function runningLow(usage: UsageLimits) {
  if (usage.ai_searches_limit === -1 || usage.ai_searches_limit <= 0) return false;
  return usage.ai_searches_used / usage.ai_searches_limit > 0.8;
}

function labelOf(
  map: Record<string, MessageKey>,
  raw: string,
  t: (key: MessageKey) => string,
): string {
  const key = map[raw];
  return key ? t(key) : raw;
}

/** "14 oct 2026" — the Courier margin note, not "October 14, 2026". */
const formatDateIn = (locale: Locale, dateString: string) => {
  const tag = locale === "tr" ? "tr-TR" : "en-GB";
  return new Date(dateString)
    .toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" })
    .toLocaleLowerCase(tag);
};
