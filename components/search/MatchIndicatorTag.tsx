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
  const base = "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border shadow-sm";
  if (label === "Best pick")
    return `${base} bg-primary/15 text-primary border-primary/40 dark:text-orange-400 dark:border-primary/35`;
  if (label === "Great match")
    return `${base} bg-amber-500/15 text-amber-700 border-amber-400/40 dark:text-amber-400 dark:border-amber-500/30`;
  if (label === "Good match")
    return `${base} bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-400 dark:border-teal-500/25`;
  if (label === "Worth a look")
    return `${base} bg-muted/60 text-muted-foreground border-border/50`;
  // Special match types (Exact quote, This is the one, Character match, etc.)
  return `${base} bg-violet-500/15 text-violet-700 border-violet-400/35 dark:text-violet-400 dark:border-violet-500/30`;
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
