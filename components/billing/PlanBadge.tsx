"use client";

/**
 * The tier, said once.
 *
 * This was a shadcn Badge carrying amber and violet Tailwind pairs, which are
 * two colours the product does not otherwise own, plus a rocket or a crown.
 * It is a label, not a button and not an achievement: sharp corners, the
 * stage-direction face, and a gel dot to mark a paid plan. No icon.
 *
 * Deliberately NOT a full theatre surface. It sits inside the billing page's
 * shadcn cards, and one theatre-styled element on an otherwise untouched page
 * reads as a mistake rather than a direction. It borrows the faces and the gel
 * and takes its ink from the page it is on.
 */

import { theatreFontVars } from "@/lib/fonts/theatre";

interface PlanBadgeProps {
  planName: string;
  /** Kept for callers; the tag has one presentation now. */
  variant?: "default" | "outline" | "secondary";
  /** Shows the gel dot that marks a paid plan. */
  showIcon?: boolean;
  className?: string;
}

const DISPLAY: Record<string, string> = {
  pro: "Pro",
  plus: "Plus",
  elite: "Elite",
  unlimited: "Unlimited",
  free: "Free",
};

export function PlanBadge({
  planName,
  showIcon = true,
  className,
}: PlanBadgeProps) {
  const key = planName.toLowerCase();
  const label = DISPLAY[key] ?? "Free";
  const paid = key !== "free";

  return (
    <span
      className={`theatre-tokens ${theatreFontVars} inline-flex items-center gap-2 border px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] ${
        className || ""
      }`}
      style={{
        fontFamily: "var(--t-direction)",
        borderColor: paid
          ? "color-mix(in oklab, var(--t-gel) 55%, transparent)"
          : "var(--border)",
        color: "var(--muted-foreground)",
      }}
    >
      {showIcon && paid && (
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ background: "var(--t-gel)" }}
        />
      )}
      {label}
    </span>
  );
}
