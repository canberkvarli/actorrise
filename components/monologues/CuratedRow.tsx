"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Monologue } from "@/types/actor";
import { MonologueResultCard } from "@/components/monologue/MonologueResultCard";
import { IconArrowRight } from "@tabler/icons-react";

interface CuratedRowProps {
  title: string;
  monologues: Monologue[];
  seeAllHref: string;
  isLoading?: boolean;
  onSelect: (mono: Monologue) => void;
  onToggleFavorite: (e: React.MouseEvent, mono: Monologue) => void;
  /** Hide the per-card "Best pick / Great match" indicator on curated rows. */
  showMatchBadge?: boolean;
}

export function CuratedRow({
  title,
  monologues,
  seeAllHref,
  isLoading = false,
  onSelect,
  onToggleFavorite,
  showMatchBadge = false,
}: CuratedRowProps) {
  // Empty state: omit row entirely when not loading and there are no results.
  if (!isLoading && monologues.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <Link
          href={seeAllHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          See all
          <IconArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="relative -mx-4 sm:mx-0">
        <div className="flex gap-3 overflow-x-auto px-4 sm:px-0 pb-2 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="w-[280px] shrink-0 snap-start"
                >
                  <Skeleton className="h-[260px] w-full" />
                </div>
              ))
            : monologues.map((mono, idx) => (
                <div
                  key={mono.id}
                  className="w-[280px] shrink-0 snap-start"
                >
                  <MonologueResultCard
                    mono={mono}
                    index={idx}
                    onSelect={() => onSelect(mono)}
                    onToggleFavorite={onToggleFavorite}
                    showMatchBadge={showMatchBadge}
                  />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
