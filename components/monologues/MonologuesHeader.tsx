"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  IconSearch,
  IconAdjustments,
  IconArrowRight,
  IconX,
} from "@tabler/icons-react";
import { useTypewriterPlaceholder } from "@/hooks/useTypewriterPlaceholder";
import { QuickFilterChips } from "@/components/search/QuickFilterChips";
import { ActiveFilterChips } from "@/components/search/ActiveFilterChips";
import type { SearchFiltersState } from "@/components/search/SearchFiltersSheet";

interface MonologuesHeaderProps {
  query: string;
  setQuery: (q: string) => void;
  filters: SearchFiltersState;
  setFilters: (
    f: SearchFiltersState | ((prev: SearchFiltersState) => SearchFiltersState),
  ) => void;
  onOpenFiltersSheet: () => void;
  hasActiveFilters: boolean;
}

const FILTER_LABELS: Record<string, string> = {
  gender: "Gender",
  age_range: "Age",
  emotion: "Emotion",
  theme: "Theme",
  category: "Category",
  tone: "Tone",
  difficulty: "Difficulty",
  author: "Author",
  max_duration: "Max duration",
};

const EMPTY_FILTERS: SearchFiltersState = {
  gender: "",
  age_range: "",
  emotion: "",
  theme: "",
  category: "",
  tone: "",
  difficulty: "",
  author: "",
  max_duration: "",
};

export function MonologuesHeader({
  query,
  setQuery,
  filters,
  setFilters,
  onOpenFiltersSheet,
  hasActiveFilters,
}: MonologuesHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const examples = useMemo(
    () => [
      "funny monologue for a 20 year old, under 2 min",
      "dramatic classical piece for a woman",
      "comedic monologue about love",
      "angry male monologue, contemporary",
      "audition piece for drama school",
      "Shakespeare monologue for a young man",
    ],
    [],
  );

  const {
    placeholder: typewriterText,
    pause: pauseTypewriter,
    scheduleResume: resumeTypewriter,
  } = useTypewriterPlaceholder(examples, {
    enabled: !query,
    resumeDelayMs: 4000,
  });

  const toggleQuickFilter = (key: keyof SearchFiltersState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <header className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-sm font-semibold text-muted-foreground tracking-tight">
          Monologues
        </h1>
        <Link
          href="/submit-monologue"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Contribute a monologue
          <IconArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="relative">
        <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={pauseTypewriter}
          onBlur={() => {
            if (!query) resumeTypewriter();
          }}
          placeholder={
            typewriterText || "Search by character, play, mood, length..."
          }
          className="h-12 pl-11 pr-24 text-base"
          aria-label="Search monologues"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-14 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Clear search"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onOpenFiltersSheet}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9"
          aria-label="More filters"
        >
          <IconAdjustments className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <QuickFilterChips filters={filters} onToggle={toggleQuickFilter} />
        <button
          type="button"
          onClick={onOpenFiltersSheet}
          className="text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
        >
          More filters
        </button>
      </div>

      {hasActiveFilters && (
        <ActiveFilterChips
          filters={filters as unknown as Record<string, string>}
          labels={FILTER_LABELS}
          onRemove={(key) =>
            setFilters((prev) => ({
              ...prev,
              [key]: "",
            }))
          }
          onClearAll={() => setFilters(EMPTY_FILTERS)}
        />
      )}
    </header>
  );
}
