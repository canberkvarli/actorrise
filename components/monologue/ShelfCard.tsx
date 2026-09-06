"use client";

import Link from "next/link";
import type { Monologue } from "@/types/actor";

/**
 * The card used by both pre-search shelves — "Picked for your type" and
 * "Trending this week". They rendered identical JSX in two files; the source
 * tag went in once rather than twice.
 */

/** "play" | "film" | "tv" | "tv_series" → the word an actor would say. */
function sourceLabel(sourceType?: string | null): string | null {
  const t = (sourceType ?? "").toLowerCase();
  if (t.startsWith("tv")) return "TV";
  if (t === "film") return "Film";
  if (t === "play") return "Play";
  return null;
}

export function ShelfCard({ m }: { m: Monologue }) {
  const mins = Math.round((m.estimated_duration_seconds || 0) / 60);
  const meta = [m.character_age_range, m.tone, mins ? `${mins} min` : null].filter(
    Boolean,
  );
  /* Where a piece comes from changes whether it's the right piece — a film
     monologue is the wrong answer for a classical audition and vice versa —
     so it earns its own tag rather than a fourth item in the dot-separated
     meta, which already wraps on a narrow card. Sharp corners: it isn't a
     control, and only clickable things are rounded here. */
  const source = sourceLabel(m.source_type);

  return (
    <Link
      prefetch={false}
      href={`/monologue/${m.id}`}
      className="group flex h-full flex-col rounded-xl border border-border/50 bg-card/40 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_0_24px_-12px_var(--primary)]"
    >
      <h3 className="font-typewriter text-base font-semibold leading-snug text-foreground line-clamp-1">
        {m.character_name}
      </h3>
      <p className="font-typewriter text-xs text-muted-foreground line-clamp-1">
        {m.play_title}
      </p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <p className="min-w-0 text-xs text-muted-foreground/70">{meta.join(" · ")}</p>
        {source && (
          <span className="shrink-0 border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {source}
          </span>
        )}
      </div>
    </Link>
  );
}

export default ShelfCard;
