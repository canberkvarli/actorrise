"use client";

import type { SearchFiltersState } from "@/components/search/SearchFiltersSheet";

interface FilterGroup {
  key: keyof SearchFiltersState;
  options: { label: string; value: string }[];
}

const GROUPS: FilterGroup[] = [
  { key: "tone", options: [{ label: "Comedic", value: "comedic" }, { label: "Dramatic", value: "dramatic" }] },
  { key: "category", options: [{ label: "Classical", value: "classical" }, { label: "Contemporary", value: "contemporary" }] },
  { key: "gender", options: [{ label: "Female", value: "female" }, { label: "Male", value: "male" }, { label: "Non-binary", value: "non-binary" }] },
  { key: "max_duration", options: [{ label: "Under 2 min", value: "120" }] },
];

interface QuickFilterChipsProps {
  filters: SearchFiltersState;
  onToggle: (key: keyof SearchFiltersState, value: string) => void;
}

export function QuickFilterChips({ filters, onToggle }: QuickFilterChipsProps) {
  return (
    // Relative wrapper so we can fade the right edge on mobile — a cue that the
    // filter row scrolls horizontally (otherwise the off-screen filters are
    // invisible until you happen to swipe).
    <div className="relative">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pr-6 sm:pr-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {GROUPS.flatMap((group) =>
          group.options.map((opt) => {
            const isActive = filters[group.key] === opt.value;
            return (
              <button
                key={`${group.key}-${opt.value}`}
                type="button"
                onClick={() => onToggle(group.key, isActive ? "" : opt.value)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })
        )}
      </div>
      {/* Right-edge fade — mobile only — signals "more filters this way". */}
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-background to-transparent sm:hidden"
        aria-hidden
      />
    </div>
  );
}
