"use client";

import Link from "next/link";
import { IconCheck } from "@tabler/icons-react";

import { Monologue } from "@/types/actor";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useToggleFavorite } from "@/hooks/useBookmarks";

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

interface CollectionRowProps {
  monologue: Monologue;
}

/**
 * Minimal index row: a large title, a single muted meta line, and a calm
 * status/action on the right (a quiet "Memorize" link, or a green check once
 * off-book). Secondary actions surface on hover (always visible on mobile).
 */
export function CollectionRow({ monologue }: CollectionRowProps) {
  const mark = useToggleMemorized();
  const toggleFavorite = useToggleFavorite();

  const memorized = Boolean(monologue.memorized);
  const duration = formatDuration(monologue.estimated_duration_seconds);
  const memorizeHref = `/monologue/${monologue.id}/memorize`;

  const meta = [monologue.character_name, monologue.play_title, monologue.author]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="group flex items-center justify-between gap-6 py-6">
      {/* Left: title + one-line meta */}
      <div className="min-w-0">
        <Link
          href={memorizeHref}
          className="block min-w-0 text-2xl font-bold leading-snug tracking-tight text-foreground transition-colors hover:text-foreground/70 sm:text-3xl"
        >
          {monologue.title}
        </Link>
        {meta && (
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {meta}
            {duration && (
              <span className="text-muted-foreground/60"> · {duration}</span>
            )}
          </p>
        )}
      </div>

      {/* Right: secondary actions (hover/mobile) + primary status */}
      <div className="flex shrink-0 items-center gap-4">
        <div className="flex items-center gap-3 text-xs text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
          {memorized ? (
            <button
              type="button"
              className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
              onClick={() =>
                mark.mutate({ monologueId: monologue.id, memorized: false })
              }
            >
              Move to study
            </button>
          ) : (
            <button
              type="button"
              className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
              onClick={() =>
                mark.mutate({ monologueId: monologue.id, memorized: true })
              }
            >
              Mark memorized
            </button>
          )}
          <button
            type="button"
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
            onClick={() =>
              toggleFavorite.mutate({
                monologueId: monologue.id,
                isFavorited: true,
              })
            }
          >
            Remove
          </button>
        </div>

        {memorized ? (
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400"
            title="Memorized"
          >
            <IconCheck className="size-4" aria-hidden />
            <span className="sr-only">Memorized</span>
          </span>
        ) : (
          <Link
            href={memorizeHref}
            className="shrink-0 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Memorize
          </Link>
        )}
      </div>
    </article>
  );
}

export default CollectionRow;
