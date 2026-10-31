"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";

import { useSubscription, useUsageLimits } from "@/hooks/useSubscription";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { spanOfDays, tasteDays } from "@/lib/trial";

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
  const left = daysLeft(taste?.ends_at ?? grantedEndsAt);
  const body = granted
    ? length
      ? `You've been busy. Here's ${spanOfDays(length)} of everything, on me. No card.`
      : "You've been busy. Here's Plus, on me. No card."
    : left
      ? `Plus, on me: ${left}.`
      : "Plus, on me.";

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
          aria-label="Close"
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

/** "5 days left", "3 hours left". Empty when there is no end to count to. */
export function daysLeft(endsAt: string | null | undefined, now: number = Date.now()): string {
  if (!endsAt) return "";
  const hours = Math.max(0, (new Date(endsAt).getTime() - now) / 36e5);
  if (hours < 1) return "less than an hour left";
  if (hours < 24) return `${Math.ceil(hours)} ${Math.ceil(hours) === 1 ? "hour" : "hours"} left`;
  const days = Math.ceil(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} left`;
}
