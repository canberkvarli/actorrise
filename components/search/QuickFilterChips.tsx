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

/** The two shelf colours, matching `.t-src--*`. */
const TAG_COLOR: Record<SourceTagKind, { line: string; text: string; on: string }> = {
  classical: { line: "oklch(0.58 0.18 45)", text: "oklch(0.50 0.16 45)", on: "oklch(0.96 0.02 85)" },
  contemporary: { line: "oklch(0.58 0.18 45)", text: "oklch(0.50 0.16 45)", on: "oklch(0.96 0.02 85)" },
  film: { line: "oklch(0.62 0.15 300)", text: "oklch(0.50 0.15 300)", on: "oklch(0.98 0.01 300)" },
  tv: { line: "oklch(0.62 0.15 300)", text: "oklch(0.50 0.15 300)", on: "oklch(0.98 0.01 300)" },
};

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
                  border: `1.5px solid ${
                    isActive ? (c ? c.line : "var(--t-text)") : c ? c.line : "var(--t-line-light)"
                  }`,
                  background: isActive ? (c ? c.line : "var(--t-gel)") : "transparent",
                  color: isActive
                    ? c
                      ? c.on
                      : "var(--t-text)"
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
