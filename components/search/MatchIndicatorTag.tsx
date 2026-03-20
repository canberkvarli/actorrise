"use client";

/**
 * Standardized match/indicator tag that overlays the top of a card.
 * Does not affect layout (position: absolute). Use inside a relative container.
 * Each label tier gets its own color to communicate ranking at a glance.
 */

/** Teal accent for bookmark/saved state and section icons (dashboard, search, saved). */
export const accentTeal = {
  bg: "bg-teal-500/15",
  bgHover: "hover:bg-teal-500/25",
  hoverBg: "hover:bg-teal-500/15",
  text: "text-teal-500 dark:text-teal-400",
  textHover: "hover:text-teal-500",
} as const;

function getTagStyle(label: string): string {
  const base = "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border shadow-sm rounded-md";
  // Strong: top picks and special match types (exact quote, fuzzy quote, title/character/play match)
  const strong = `${base} bg-primary/15 text-primary border-primary/40 dark:text-orange-400 dark:border-primary/35`;
  // Muted: general ranking tiers
  const muted = `${base} bg-muted/60 text-muted-foreground border-border/50`;

  if (label === "Best pick") return strong;
  if (label === "Great match" || label === "Good match") return muted;
  // Special match types (Exact quote, This is the one, Character match, etc.)
  return strong;
}

export const matchIndicatorTagClass = getTagStyle("Good match");

export interface MatchIndicatorTagProps {
  label: string;
  /** Optional: wrap in absolute-positioned container so it overlays the card. Default true. */
  overlay?: boolean;
}

export function MatchIndicatorTag({ label, overlay = true }: MatchIndicatorTagProps) {
  const tag = <span className={getTagStyle(label)}>{label}</span>;
  if (!overlay) return tag;
  return (
    <div
      className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2"
      aria-hidden
    >
      {tag}
    </div>
  );
}
