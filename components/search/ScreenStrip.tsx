"use client";

import { MonologueSpeech } from "@/components/monologue/MonologueSpeech";
import type { Monologue } from "@/types/actor";

/**
 * A few film and TV pieces under a Plays search the plays could not serve
 * (backend app/services/search/screen_strip.py). The Plays tab is mostly
 * classics, and a class looking for contemporary teen pieces kept getting the
 * same handful there while about three hundred sat under Film & TV. The plays
 * results above are untouched; this only adds what the other shelf has.
 */
export function ScreenStrip({
  pieces,
  startIndex,
  onSelect,
  onToggleFavorite,
  onSeeAll,
  isModerator,
  onEdit,
}: {
  pieces: Monologue[];
  startIndex: number;
  onSelect: (mono: Monologue, index: number) => void;
  onToggleFavorite: (e: React.MouseEvent, mono: Monologue) => void;
  onSeeAll: () => void;
  isModerator?: boolean;
  onEdit?: (id: number) => void;
}) {
  if (pieces.length === 0) return null;
  return (
    <section aria-label="From film and TV" className="mt-8 mb-4 border-t border-border pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="stage-direction text-sm text-muted-foreground">
          (the same ask, from film and TV.)
        </span>
        <button
          type="button"
          onClick={onSeeAll}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          More in Film &amp; TV
        </button>
      </div>
      <div>
        {pieces.map((mono, i) => (
          <MonologueSpeech
            key={`screen-${mono.id}`}
            mono={mono}
            index={startIndex + i}
            mode="film_tv"
            onSelect={() => onSelect(mono, startIndex + i)}
            onToggleFavorite={onToggleFavorite}
            isModerator={isModerator}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
}
