"use client";

import Link from "next/link";
import type { Monologue } from "@/types/actor";
import { MonologueSourceTag } from "@/components/search/SourceTag";

/**
 * The card used by both pre-search shelves — "Picked for your type" and
 * "Trending this week".
 *
 * A row rather than a tile: the shelves sit two columns wide, and a row lets
 * the name, the play and the running time line up down the column instead of
 * each card measuring itself.
 *
 * The source tag used to sit in the right-hand group, immediately before the
 * meta. Tag widths differ — "film" against "contemporary" is a 60px swing —
 * so the meta started at a different x on every row and the right half of the
 * shelf read as ragged. The tag now sits with the play title, which is the
 * thing it describes, and the meta gets the right edge to itself.
 *
 * `rank` is what tells the two shelves apart. They were identical rows in two
 * identical columns; a position numeral is both the distinction and the actual
 * meaning of "trending", so the shelf that has an order shows it.
 */
export function ShelfCard({ m, rank }: { m: Monologue; rank?: number }) {
  const mins = Math.round((m.estimated_duration_seconds || 0) / 60);
  const meta = [m.character_age_range, m.tone, mins ? `${mins} min` : null].filter(Boolean);

  /* Nothing rather than an echo. A title role ("Hamlet" from Hamlet) printed
     both lines identically, which reads as a rendering fault, not two facts. */
  const showPlay =
    m.play_title?.trim().toLowerCase() !== m.character_name?.trim().toLowerCase();

  return (
    <Link prefetch={false} href={`/monologue/${m.id}`} className="t-shelf-row group">
      {typeof rank === "number" && (
        <span aria-hidden className="t-shelf-row__rank">
          {rank}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="t-shelf-row__name">{m.character_name}</span>
        <span className="t-shelf-row__sub">
          {showPlay && <span className="truncate">{m.play_title}</span>}
          <MonologueSourceTag monologue={m} />
        </span>
      </span>

      <span className="t-shelf-row__meta">{meta.join(" · ")}</span>
    </Link>
  );
}

export default ShelfCard;
