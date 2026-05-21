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
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {GROUPS.map((group, gi) => (
        <div key={group.key} className="flex items-center gap-1.5 shrink-0">
          {gi > 0 && <span className="w-px h-4 bg-border/60 mx-0.5" aria-hidden />}
          <div className="inline-flex rounded-lg border border-border/60 overflow-hidden">
            {group.options.map((opt) => {
              const isActive = filters[group.key] === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onToggle(group.key, isActive ? "" : opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-foreground text-background"
                      : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  } ${group.options.length > 1 ? "border-r border-border/60 last:border-r-0" : ""}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
