"use client";

import Link from "next/link";
import type { Monologue } from "@/types/actor";
import { MonologueSourceTag } from "@/components/search/SourceTag";

/**
 * The card used by both pre-search shelves — "Picked for your type" and
 * "Trending this week". They rendered identical JSX in two files; the source
 * tag went in once rather than twice.
 *
 * A row rather than a tile: the shelves sit two columns wide, and a row lets
 * the name, the play and the running time line up down the column instead of
 * each card measuring itself.
 */
export function ShelfCard({ m }: { m: Monologue }) {
  const mins = Math.round((m.estimated_duration_seconds || 0) / 60);
  const meta = [m.character_age_range, m.tone, mins ? `${mins} min` : null].filter(Boolean);

  return (
    <Link prefetch={false} href={`/monologue/${m.id}`} className="t-shelf-row group">
      <div className="min-w-0">
        <h3
          className="truncate"
          style={{ fontFamily: "var(--t-direction)", fontWeight: 700, fontSize: 17, color: "var(--t-text)" }}
        >
          {m.character_name}
        </h3>
        {/* Nothing rather than an echo. A title role ("Hamlet" from Hamlet,
            "Othello" from Othello) printed both lines identically, which reads
            as a rendering fault instead of two facts. */}
        {m.play_title?.trim().toLowerCase() !== m.character_name?.trim().toLowerCase() && (
          <p
            className="truncate"
            style={{ fontFamily: "var(--t-direction)", fontSize: 12, color: "var(--t-muted-dark-2)" }}
          >
            {m.play_title}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {/* Where a piece comes from changes whether it is the right piece — a
            film monologue is the wrong answer for a classical audition and the
            other way round — so it gets the shelf pill rather than a fourth
            item in the dot-separated meta. */}
        <MonologueSourceTag monologue={m} />
        <span className="text-xs font-semibold" style={{ color: "var(--t-muted-dark)" }}>
          {meta.join(" · ")}
        </span>
      </div>
    </Link>
  );
}

export default ShelfCard;
