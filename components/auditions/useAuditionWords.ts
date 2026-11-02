"use client";

import { useMemo } from "react";

import { useLocale, useT, type MessageKey } from "@/lib/i18n";
import { clockIn, daysUntil, safeTz, type Audition, type AuditionKind, type NextStep } from "@/lib/auditions";

/** nextStep()'s English labels, to their keys. lib/auditions decides the step; this says it. */
const STEP_KEY: Record<string, MessageKey> = {
  "Add the callback": "appAuditionsWords.stepAddCallback",
  "How did it go?": "appAuditionsWords.stepHowDidItGo",
  "Add their sides": "appAuditionsWords.stepAddSides",
  "Run your sides": "appAuditionsWords.stepRunSides",
  "Pick your piece": "appAuditionsWords.stepPickPiece",
  Pack: "appAuditionsWords.stepPack",
  "Run it again": "appAuditionsWords.stepRunAgain",
};

const KIND_KEY: Record<AuditionKind, MessageKey> = {
  in_person: "appAuditionsWords.kindInPerson",
  self_tape: "appAuditionsWords.kindSelfTape",
  virtual: "appAuditionsWords.kindVirtual",
};

/**
 * The words lib/auditions builds for display (kind, the eyebrow, the when),
 * in the reader's language. Same decisions as lib/auditions; English output is
 * identical to it, dates and clocks are formatted in the active locale.
 */
export function useAuditionWords() {
  const t = useT();
  const locale = useLocale();
  return useMemo(() => {
    const tag = locale === "tr" ? "tr-TR" : "en-US";
    const clock = (iso: string, tz: string) =>
      locale === "tr"
        ? new Date(iso).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", timeZone: safeTz(tz) })
        : clockIn(iso, tz);
    const kind = (k: AuditionKind) => t(KIND_KEY[k]);

    function eyebrow(a: Audition, now: Date = new Date(), next = false): string {
      if (a.status === "booked") return t("appAuditionsWords.booked");
      if (a.status === "passed") return t("appAuditionsWords.notThisTime");
      if (a.scope !== "upcoming") return a.status === "callback" ? t("appAuditionsWords.callback") : t("appAuditionsWords.waiting");
      const d = daysUntil(a, now);
      const at = a.when ? clock(a.when, a.tz) : "";
      const due = a.kind === "self_tape";
      if (d === 0) return due ? t("appAuditionsWords.tapeDueToday", { at }) : t("appAuditionsWords.todayAt", { at });
      if (d === 1) return due ? t("appAuditionsWords.tapeDueTomorrow", { at }) : t("appAuditionsWords.tomorrowAt", { at });
      const lead = next
        ? t("appAuditionsWords.nextUp")
        : a.status === "callback"
          ? t("appAuditionsWords.callback")
          : t("appAuditionsWords.comingUp");
      return d == null ? lead : t("appAuditionsWords.leadInDays", { lead, n: d });
    }

    function whenSentence(a: Pick<Audition, "when" | "tz" | "kind">): string | null {
      if (!a.when) return null;
      const day = new Date(a.when).toLocaleDateString(tag, { weekday: "long", month: "short", day: "numeric", timeZone: safeTz(a.tz) });
      const time = clock(a.when, a.tz);
      return a.kind === "self_tape" ? t("appAuditionsWords.dueDayAt", { day, time }) : t("appAuditionsWords.dayAt", { day, time });
    }

    function whenLabel(a: Pick<Audition, "when" | "tz" | "kind">): string {
      if (!a.when) return t("appAuditionsWords.noDate");
      const d = new Date(a.when);
      const timeZone = safeTz(a.tz);
      const day = d.toLocaleDateString(tag, { weekday: "short", month: "short", day: "numeric", timeZone });
      const time = d.toLocaleTimeString(tag, { hour: "numeric", minute: "2-digit", timeZone });
      return a.kind === "self_tape" ? t("appAuditionsWords.dueLabel", { day, time }) : t("appAuditionsWords.dayLabel", { day, time });
    }

    const stepLabel = (step: NextStep) => (STEP_KEY[step.label] ? t(STEP_KEY[step.label]) : step.label);

    return { tag, clock, kind, eyebrow, whenSentence, whenLabel, stepLabel };
  }, [t, locale]);
}
