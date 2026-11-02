"use client";

/**
 * The trial words from lib/trial.ts, said in the reader's language.
 *
 * lib/trial.ts stays the one place that decides the length (it reads
 * trial_days off /me); this only says that number in English or Turkish.
 * English output is exactly what lib/trial.ts prints, so a reader on "en"
 * sees no change.
 */

import { useCallback } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import { useT, type Locale } from "@/lib/i18n";
import { PLUS_ANNUAL, PLUS_MONTHLY } from "@/lib/paywall/offer";
import { tasteDays, type TrialWords } from "@/lib/trial";

export function localeTag(locale: Locale): string {
  return locale === "tr" ? "tr-TR" : "en-US";
}

/** "a week" -> "A week". Locale-aware, so Turkish "iki" opens as "İki". */
export function capIn(s: string, locale: Locale): string {
  return s ? s[0].toLocaleUpperCase(localeTag(locale)) + s.slice(1) : s;
}

/** "November 7" / "7 Kasım": the day a trial started now would be charged. */
export function chargeDateIn(locale: Locale, now: Date, days: number): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString(localeTag(locale), { month: "long", day: "numeric" });
}

/** Dollars from cents, "$12.00" in English and "$12,00" in Turkish. */
export function moneyIn(locale: Locale, cents: number): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "a week", "3 days": a length of free Plus, mid-sentence. */
export function useSpanOfDays() {
  const t = useT();
  return useCallback(
    (days: number) => {
      if (days === 7) return t("appAccountTrial.span7");
      if (days === 14) return t("appAccountTrial.span14");
      if (days === 1) return t("appAccountTrial.span1");
      return t("appAccountTrial.spanN", { n: days });
    },
    [t],
  );
}

export type TrialText = TrialWords;

/** useTrialWords(), with every printed field in the active locale. */
export function useTrialText(): TrialText {
  const words = useTrialWords();
  const { subscription } = useSubscription();
  const t = useT();

  if (words.tasted) {
    const tastedDays = tasteDays(subscription?.taste);
    const overTitle = !tastedDays
      ? t("appAccountTrial.overTitleUnknown")
      : tastedDays === 7
        ? t("appAccountTrial.overTitle7")
        : tastedDays === 14
          ? t("appAccountTrial.overTitle14")
          : tastedDays === 1
            ? t("appAccountTrial.overTitle1")
            : t("appAccountTrial.overTitleN", { n: tastedDays });
    return {
      ...words,
      cta: t("appAccountTrial.tastedCta"),
      short: t("appAccountTrial.tastedShort", { monthly: PLUS_MONTHLY }),
      terms: t("appAccountTrial.tastedTerms", { monthly: PLUS_MONTHLY, annual: PLUS_ANNUAL }),
      overTitle,
      overBody: t("appAccountTrial.overBody"),
    };
  }

  const d = words.days;
  const short =
    d === 7
      ? t("appAccountTrial.short7")
      : d === 14
        ? t("appAccountTrial.short14")
        : t("appAccountTrial.shortN", { n: d });
  const span =
    d === 7
      ? t("appAccountTrial.span7")
      : d === 14
        ? t("appAccountTrial.span14")
        : t("appAccountTrial.spanN", { n: d });
  return {
    ...words,
    cta: t("appAccountTrial.cta", { short }),
    short,
    span,
    terms: t("appAccountTrial.terms"),
  };
}
