"use client";

import { useEffect, useRef, useState } from "react";

import { useSubscription } from "@/hooks/useSubscription";
import { api } from "@/lib/api";
import { trackEvent } from "@/lib/events";
import { useLocale, useT } from "@/lib/i18n";
import { chargeDateIn } from "@/components/billing/trialText";

/**
 * The no-card trial's one reminder, in the app and never by email (Canberk,
 * 2026-09-29: no email about a trial ending). Shown only while a Stripe trial
 * has no card on the subscription or the customer (/api/subscriptions/me
 * card_needed); without one the trial simply stops when it ends.
 *
 * Two places: a thin bar over every page (`bar`), and a card on the page right
 * after checkout (`success`). The bar alone reached nobody: both no-card trials
 * (2026-11-16 to 11-19) left minutes after starting and never came back, so the
 * success page is the one moment they are sure to be looking.
 *
 * The button opens Stripe's billing portal, where a card added becomes the
 * customer's default, which is what Stripe checks before it lets the trial
 * roll into the paid plan.
 */
export function CardNeededBanner({ where = "bar" }: { where?: "bar" | "success" }) {
  const { subscription } = useSubscription();
  const t = useT();
  const locale = useLocale();
  const [opening, setOpening] = useState(false);
  const shown = useRef(false);
  const needed = !!subscription?.card_needed;

  useEffect(() => {
    if (!needed || shown.current) return;
    shown.current = true;
    trackEvent("card_ask_shown", { where });
  }, [needed, where]);

  if (!needed) return null;

  const ends = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const date = ends ? chargeDateIn(locale, ends, 0) : null;

  const open = async () => {
    setOpening(true);
    trackEvent("card_ask_clicked", { where });
    try {
      const { data } = await api.post<{ portal_url: string }>("/api/subscriptions/create-portal-session");
      window.location.href = data.portal_url;
    } catch {
      setOpening(false);
    }
  };

  const button = (
    <button
      type="button"
      onClick={open}
      disabled={opening}
      className={
        where === "success"
          ? "rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          : "rounded-full bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
      }
    >
      {opening ? t("appAccountCardNeeded.opening") : t("appAccountCardNeeded.cta")}
    </button>
  );

  if (where === "success") {
    return (
      <div role="status" className="mb-6 border border-primary/30 bg-primary/10 p-5 text-center">
        <p className="mb-1 font-semibold">{t("appAccountCardNeeded.successTitle")}</p>
        <p className="mb-4 text-sm text-muted-foreground" suppressHydrationWarning>
          {date
            ? t("appAccountCardNeeded.successBody", { date })
            : t("appAccountCardNeeded.successBodyNoDate")}
        </p>
        {button}
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-primary/30 bg-primary/10 px-4 py-2 text-center text-[13px]"
    >
      <span suppressHydrationWarning>
        {date ? t("appAccountCardNeeded.body", { date }) : t("appAccountCardNeeded.bodyNoDate")}
      </span>
      {button}
    </div>
  );
}
