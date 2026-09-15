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

/** What each tier opens. Copy only — the numbers come from the same table the
 *  pricing page quotes, and nothing here is derived from the user's account. */
const WHAT_IT_OPENS: Record<
  string,
  { label: string; value: string; unit?: string; none?: boolean }[]
> = {
  unlimited: [
    { label: "searches", value: "no limit" },
    { label: "collection", value: "no limit" },
    { label: "scripts", value: "no limit" },
    { label: "scenepartner", value: "100", unit: "a month" },
    { label: "uploads", value: "no limit" },
  ],
  plus: [
    { label: "searches", value: "150", unit: "a month" },
    { label: "collection", value: "no limit" },
    { label: "scripts", value: "10" },
    { label: "scenepartner", value: "30", unit: "a month" },
    { label: "uploads", value: "10" },
  ],
  free: [
    { label: "searches", value: "10", unit: "a month" },
    { label: "collection", value: "5" },
    { label: "scripts", value: "3" },
    { label: "scenepartner", value: "1", unit: "to try" },
    { label: "uploads", value: "not on free", none: true },
  ],
};

export default function BillingPage() {
  useAuth();
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);

  const { subscription, isLoading: subLoading, isError: subError } = useSubscription();
  const { usage, isLoading: usageLoading } = useUsageLimits();
  const { history: billingHistory, isLoading: historyLoading } = useBillingHistory();

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
          : "Couldn't open the billing portal. Try again, or use Contact in the menu.",
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
          <p className="t-bill__head">the window is shut</p>
          <p className="t-stub__terms">
            I couldn&apos;t load your plan just now. Nothing has changed on your
            account, so refresh and it should come back.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="t-bring-in mt-5"
          >
            Try again
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
              <span>admit one</span>
              <span className="t-stub__serial">
                {subscription?.status === "trialing" ? "on trial" : " "}
              </span>
            </p>

            <h2 className="t-stub__tier">
              {subscription?.tier_display_name ?? "Free"}
            </h2>

            <p className="t-stub__terms">
              {isFree ? (
                <>
                  the house seats. everything below is open to you, and the
                  numbers are small on purpose.
                </>
              ) : (
                <>
                  {subscription?.billing_period ? `billed ${subscription.billing_period}` : null}
                  {subscription?.billing_period && subscription?.current_period_end ? " · " : null}
                  {subscription?.current_period_end
                    ? `${subscription.cancel_at_period_end ? "ends" : "renews"} ${formatDate(
                        subscription.current_period_end,
                      )}`
                    : null}
                </>
              )}
            </p>

            {subscription?.cancel_at_period_end && (
              <span className="t-stub__ending">ends at the period</span>
            )}

            <div className="t-stub__actions">
              {isFree ? (
                <>
                  <Link
                    href="/checkout?tier=plus&period=monthly&trial=1"
                    className="t-cta t-cta--paper t-cta--stub"
                  >
                    Two weeks of Plus, free
                    <span className="t-cta__dot" aria-hidden>
                      <IconGift className="h-4 w-4" />
                    </span>
                  </Link>
                  <Link href="/pricing" className="t-bring-in">
                    <IconSparkles className="h-4 w-4" />
                    See the plans
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
                  {isManagingSubscription ? "Opening…" : "Manage subscription"}
                </button>
              ) : (
                /* Comped accounts have no Stripe customer, so there is no
                   portal to send them to. Saying so is kinder than a button
                   that errors. */
                <p className="t-stub__terms" style={{ marginTop: 0 }}>
                  this one is on the house, so there is nothing to manage.{" "}
                  <Link href="/pricing" className="t-note__ask">
                    the plans
                  </Link>
                </p>
              )}
            </div>
          </div>

          <div aria-hidden className="t-stub__perf" />

          <div className="t-stub__bottom">
            <p className="t-bill__head">what it opens</p>
            <div className="mt-2">
              {opens.map((row) => (
                <div key={row.label} className="t-leader" data-none={row.none || undefined}>
                  <span>{row.label}</span>
                  <span aria-hidden className="t-leader__dots" />
                  <span className="t-leader__value">
                    {row.value}
                    {row.unit && <em> {row.unit}</em>}
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
              this month
              <span className="t-bill__aside">(resets on the 1st.)</span>
            </p>

            <div className="mt-4 space-y-4">
              <Meter
                label="searches"
                used={usage?.ai_searches_used ?? 0}
                limit={usage?.ai_searches_limit ?? 0}
              />
              {usage && usage.scene_partner_limit > 0 && (
                <Meter
                  label="scenepartner"
                  used={usage.scene_partner_used}
                  limit={usage.scene_partner_limit}
                />
              )}
              {usage && usage.craft_coach_limit > 0 && (
                <Meter
                  label="craft coach"
                  used={usage.craft_coach_used}
                  limit={usage.craft_coach_limit}
                />
              )}
            </div>

            {usage && runningLow(usage) && (
              <p className="t-note mt-5">
                <span>running low on searches.</span>
                <Link href="/pricing" className="t-note__ask">
                  more of them
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
              <p className="t-bill__head">receipts</p>
              <div className="mt-3">
                {billingHistory.map((item) => (
                  <div key={item.id} className="t-receipt">
                    <span className="t-receipt__what">
                      {item.description || "Payment"}
                      <span className="t-receipt__when">
                        {formatDate(item.created_at)}
                        {item.status !== "succeeded" ? ` · ${item.status}` : ""}
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
                        aria-label={`Invoice for ${formatDate(item.created_at)}`}
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
            <span>student, teacher, coach or school?</span>
            <button type="button" onClick={() => setPromoModalOpen(true)} className="t-note__ask">
              ask for a discount
            </button>
          </motion.p>
        </div>
      </div>

      <RequestPromoCodeModal open={promoModalOpen} onOpenChange={setPromoModalOpen} />
    </div>
  );
}

function Head() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <p className="t-slug">(the box office.)</p>
      <h1 className="t-stage-title t-boxoffice-title">Billing</h1>
    </motion.div>
  );
}

/** One line of the meter. A limit of -1 is "no limit", which has no bar to
 *  draw — a full track would read as "you are out". */
function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === -1;
  const pct = unlimited || limit <= 0 ? 0 : Math.min((used / limit) * 100, 100);
  return (
    <div>
      <p className="t-meter__row">
        <span>{label}</span>
        <span className="t-meter__count">
          {unlimited ? `${used} · no limit` : `${used} / ${limit}`}
        </span>
      </p>
      {!unlimited && (
        <div
          className="t-meter"
          role="progressbar"
          aria-label={`${label} used this month`}
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

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** "14 oct 2026" — the Courier margin note, not "October 14, 2026". */
const formatDate = (dateString: string) =>
  new Date(dateString)
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    .toLowerCase();
