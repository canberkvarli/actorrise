"use client";

import { IconAdjustments } from "@tabler/icons-react";
import type { SearchFiltersState } from "@/components/search/SearchFiltersSheet";
import type { SourceTagKind } from "@/components/search/SourceTag";

interface FilterOption {
  label: string;
  value: string;
  /** Category-ish chips wear their shelf's colour, so the chip and the pill
   *  on the row it produces are recognisably the same thing. */
  tag?: SourceTagKind;
}

interface FilterGroup {
  key: keyof SearchFiltersState;
  options: FilterOption[];
  /** Film & TV only: the source_type chips replace the era chips. */
  mode?: "plays" | "film_tv";
}

const GROUPS: FilterGroup[] = [
  { key: "tone", options: [{ label: "Comedic", value: "comedic" }, { label: "Dramatic", value: "dramatic" }] },
  {
    key: "category",
    mode: "plays",
    options: [
      { label: "Classical", value: "classical", tag: "classical" },
      { label: "Contemporary", value: "contemporary", tag: "contemporary" },
    ],
  },
  {
    key: "source_type",
    mode: "film_tv",
    options: [
      { label: "Film", value: "film", tag: "film" },
      { label: "TV", value: "tv", tag: "tv" },
    ],
  },
  { key: "gender", options: [{ label: "Female", value: "female" }, { label: "Male", value: "male" }, { label: "Non-binary", value: "non-binary" }] },
  { key: "max_duration", options: [{ label: "Under 2 min", value: "120" }] },
];

/** The two shelf colours, matching `.t-src--*`.
 *
 *  Screen pieces used to take `var(--t-text)` for their border, which is cream
 *  in dark mode — so Film and TV wore stark white outlines next to chips that
 *  wore a hairline, and the row looked like two different components. They now
 *  share the accent with the era chips: the row is one material, and which
 *  SHELF you are on is said by the mode toggle above, not by four chips
 *  shouting it. */
const TAG_COLOR: Record<SourceTagKind, { line: string; text: string; on: string }> = {
  classical: { line: "var(--acc)", text: "var(--acc)", on: "oklch(0.98 0.01 85)" },
  contemporary: { line: "var(--acc)", text: "var(--acc)", on: "oklch(0.98 0.01 85)" },
  film: { line: "var(--acc)", text: "var(--acc)", on: "oklch(0.98 0.01 85)" },
  tv: { line: "var(--acc)", text: "var(--acc)", on: "oklch(0.98 0.01 85)" },
};

/** The width the mode-swapped pair reserves.
 *
 *  Classical/Contemporary and Film/TV occupy the same two slots, but
 *  "Contemporary" is twice the width of "TV" — so switching shelves shoved
 *  every chip after it sideways and the toggle felt like it broke the row
 *  rather than changed a filter. Both pairs now hold one footprint, so the
 *  only thing that moves on a mode switch is the label inside them. */
const SHELF_CHIP_WIDTH = 132;

interface QuickFilterChipsProps {
  filters: SearchFiltersState;
  onToggle: (key: keyof SearchFiltersState, value: string) => void;
  /** Film/TV mode: era is meaningless there (everything is contemporary). */
  hideCategory?: boolean;
  mode?: "plays" | "film_tv";
  onOpenFilters?: () => void;
  activeFilterCount?: number;
}

export function QuickFilterChips({
  filters,
  onToggle,
  hideCategory,
  mode = "plays",
  onOpenFilters,
  activeFilterCount = 0,
}: QuickFilterChipsProps) {
  const groups = GROUPS.filter((g) => {
    if (g.key === "category" && hideCategory) return false;
    return !g.mode || g.mode === mode;
  });

  return (
    // Relative wrapper so we can fade the right edge on mobile — a cue that the
    // filter row scrolls horizontally (otherwise the off-screen filters are
    // invisible until you happen to swipe).
    <div className="relative">
      <div className="-my-2 flex items-center gap-2 overflow-x-auto py-2 pr-6 sm:pr-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {groups.flatMap((group) =>
          group.options.map((opt) => {
            const isActive = filters[group.key as keyof SearchFiltersState] === opt.value;
            const c = opt.tag ? TAG_COLOR[opt.tag] : null;
            return (
              <button
                key={`${group.key}-${opt.value}`}
                type="button"
                onClick={() => onToggle(group.key, isActive ? "" : opt.value)}
                // min-h-[44px] on touch only: these were 30px tall, under the
                // 44px iOS minimum, on the page that carries most of the mobile
                // traffic. Desktop keeps the compact chip via md:min-h-0.
                className="inline-flex min-h-[44px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full px-4 text-[13px] font-semibold transition-transform hover:-translate-y-0.5 hover:-rotate-1 md:min-h-9"
                style={{
                  transitionTimingFunction: "var(--t-spring)",
                  /* The shelf pair reserves one width so switching mode does
                     not reflow the row behind it. */
                  minWidth: group.mode ? SHELF_CHIP_WIDTH : undefined,
                  border: `1.5px solid ${
                    isActive ? (c ? c.line : "var(--t-text)") : c ? c.line : "var(--t-line-light)"
                  }`,
                  background: isActive ? (c ? c.line : "var(--t-text)") : "transparent",
                  /* Ink, fixed — not var(--t-text), which IS cream in dark and
                     printed a pale label on a filled chip. Whatever the theme,
                     a filled chip carries the colour that reads on its fill. */
                  color: isActive
                    ? c
                      ? c.on
                      : "var(--t-on-text)"
                    : c
                      ? c.text
                      : "var(--t-muted-dark-2)",
                }}
              >
                {opt.label}
              </button>
            );
          })
        )}
        {onOpenFilters && (
          <button
            type="button"
            onClick={onOpenFilters}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors md:min-h-9"
            style={{ border: "none", background: "transparent", color: "var(--t-muted-dark-2)" }}
          >
            <IconAdjustments className="size-4" />
            All filters
            {activeFilterCount > 0 && (
              <span className="tabular-nums" style={{ color: "var(--acc)" }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>
      {/* Right-edge fade — mobile only — signals "more filters this way". */}
      <div
        className="pointer-events-none absolute bottom-1 right-0 top-0 w-8 sm:hidden"
        style={{ background: "linear-gradient(to left, var(--page), transparent)" }}
        aria-hidden
      />
    </div>
  );
}
