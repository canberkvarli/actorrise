"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";

import { useSubscription, useUsageLimits } from "@/hooks/useSubscription";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { tasteDays } from "@/lib/trial";
import { useT } from "@/lib/i18n";
import { useSpanOfDays } from "./trialText";

/**
 * Free Plus with no card (backend services/taste.py): three days from the
 * first read wall, or the week of the reverse trial. Nothing here names a
 * length by hand: it comes off /me (taste.days) or the grant's ends_at.
 *
 * `granted` is set on the one detail response that opened the taste: that is
 * the moment to say so, once. Every other piece shows a quiet countdown while
 * it runs. No card was asked for, so nothing here sells; the ask is the wall
 * after it ends.
 */
export function TasteNote({
  granted,
  grantedEndsAt,
  aboveRunBar = false,
}: {
  granted?: boolean;
  /** The ends_at on the detail response that opened the taste. */
  grantedEndsAt?: string | null;
  aboveRunBar?: boolean;
}) {
  const { subscription, mutate } = useSubscription();
  const { mutate: mutateUsage } = useUsageLimits();
  const [closed, setClosed] = useState(false);
  const t = useT();
  const spanOfDays = useSpanOfDays();

  // The grant happened on the server just now; /me and the meter are cached
  // and still say free until they are asked again.
  useEffect(() => {
    if (!granted) return;
    mutate().catch(() => undefined);
    mutateUsage().catch(() => undefined);
  }, [granted, mutate, mutateUsage]);

  const taste = subscription?.taste;
  const running = Boolean(granted || taste?.active);
  if (!running || closed) return null;

  const length = tasteDays(taste) ?? daysUntil(grantedEndsAt);
  const left = leftWords(daysLeftCount(taste?.ends_at ?? grantedEndsAt), t);
  const body = granted
    ? length
      ? t("appAccountTaste.grantedSpan", { span: spanOfDays(length) })
      : t("appAccountTaste.granted")
    : left
      ? t("appAccountTaste.runningLeft", { left })
      : t("appAccountTaste.running");

  const foot = aboveRunBar
    ? "bottom-[calc(11rem+env(safe-area-inset-bottom,0px))] lg:bottom-4"
    : "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-4";
  return (
    <div className={`pointer-events-auto fixed left-1/2 z-[10040] w-[min(92vw,30rem)] -translate-x-1/2 ${foot}`}>
      <div className={`t-strip theatre-tokens ${theatreFontVars}`} role="status">
        <p className="t-strip__body">{body}</p>
        <button
          type="button"
          onClick={() => setClosed(true)}
          aria-label={t("appAccountUi.close")}
          className="t-offer__x shrink-0"
          style={{ position: "static" }}
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Whole days from now to `endsAt`, for a grant made a moment ago. */
function daysUntil(endsAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!endsAt) return null;
  const days = Math.round((new Date(endsAt).getTime() - now) / 864e5);
  return Number.isFinite(days) && days > 0 ? days : null;
}

type Left = { unit: "lessThanHour" | "hours" | "days"; n: number } | null;

/** What is left of the taste, counted. null when there is no end to count to. */
function daysLeftCount(endsAt: string | null | undefined, now: number = Date.now()): Left {
  if (!endsAt) return null;
  const hours = Math.max(0, (new Date(endsAt).getTime() - now) / 36e5);
  if (hours < 1) return { unit: "lessThanHour", n: 0 };
  if (hours < 24) return { unit: "hours", n: Math.ceil(hours) };
  return { unit: "days", n: Math.ceil(hours / 24) };
}

/** "5 days left", "3 hours left". Empty when there is no end to count to. */
function leftWords(left: Left, t: ReturnType<typeof useT>): string {
  if (!left) return "";
  if (left.unit === "lessThanHour") return t("appAccountTaste.lessThanHour");
  if (left.unit === "hours")
    return t(left.n === 1 ? "appAccountTaste.hourLeft" : "appAccountTaste.hoursLeft", { n: left.n });
  return t(left.n === 1 ? "appAccountTaste.dayLeft" : "appAccountTaste.daysLeft", { n: left.n });
}
