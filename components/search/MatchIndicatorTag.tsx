"use client";

/**
 * Standardized match/indicator tag that overlays the top of a card.
 * Does not affect layout (position: absolute). Use inside a relative container.
 * Same style for search results, dashboard discovery, and film/TV cards.
 * Teal accent used app-wide for indicators and saved/bookmark highlights (no purple).
 */
const INDICATOR_TAG_CLASS =
  "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-400 border border-teal-500/30 shadow-sm";

/** Teal accent for bookmark/saved state and section icons (dashboard, search, saved). */
export const accentTeal = {
  bg: "bg-teal-500/15",
  bgHover: "hover:bg-teal-500/25",
  hoverBg: "hover:bg-teal-500/15",
  text: "text-teal-500 dark:text-teal-400",
  textHover: "hover:text-teal-500",
} as const;

export const matchIndicatorTagClass = INDICATOR_TAG_CLASS;

export interface MatchIndicatorTagProps {
  label: string;
  /** Optional: wrap in absolute-positioned container so it overlays the card. Default true. */
  overlay?: boolean;
}

export function MatchIndicatorTag({ label, overlay = true }: MatchIndicatorTagProps) {
  const tag = <span className={INDICATOR_TAG_CLASS}>{label}</span>;
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
