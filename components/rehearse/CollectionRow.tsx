"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconCheck, IconArrowBackUp } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Monologue } from "@/types/actor";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useToggleFavorite } from "@/hooks/useBookmarks";

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `~${minutes}min`;
}

function relativeTime(iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  const days = Math.floor(diff / day);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

interface CollectionRowProps {
  monologue: Monologue;
}

/**
 * A roomy editorial row for a single saved monologue. Calm hierarchy: a big
 * bold title, muted meta, a quiet study line, and restrained actions.
 */
export function CollectionRow({ monologue }: CollectionRowProps) {
  const router = useRouter();
  const mark = useToggleMemorized();
  const toggleFavorite = useToggleFavorite();

  const memorized = Boolean(monologue.memorized);
  const duration = formatDuration(monologue.estimated_duration_seconds);
  const memorizeHref = `/monologue/${monologue.id}/memorize`;

  const meta = [monologue.character_name, monologue.play_title, monologue.author]
    .filter(Boolean)
    .join(" · ");

  const studied = relativeTime(monologue.last_studied_at);
  const notes = monologue.notes?.trim();

  return (
    <article className="group grid grid-cols-1 gap-x-6 gap-y-4 py-7 sm:grid-cols-[1fr_auto] sm:items-start">
      {/* Left: the reading content */}
      <div className="min-w-0 space-y-2.5">
        <div className="flex items-start gap-3">
          <Link
            href={memorizeHref}
            className="block min-w-0 text-xl font-bold leading-snug tracking-tight text-foreground transition-colors hover:text-foreground/70 sm:text-2xl"
          >
            {monologue.title}
          </Link>
          {memorized && (
            <span className="mt-1 inline-flex shrink-0 items-center gap-1 border border-emerald-600/25 bg-emerald-600/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <IconCheck className="size-3" aria-hidden />
              Memorized
            </span>
          )}
        </div>

        {meta && (
          <p className="truncate text-sm leading-relaxed text-muted-foreground">
            {meta}
            {duration && (
              <span className="text-muted-foreground/60"> · {duration}</span>
            )}
          </p>
        )}

        <p className="text-xs text-muted-foreground/80">
          {studied ? `Studied ${studied}` : "Not started yet"}
        </p>

        {notes && (
          <p className="truncate text-sm italic text-muted-foreground/70">
            {notes}
          </p>
        )}
      </div>

      {/* Right: calm actions */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end sm:gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(memorizeHref)}
        >
          Memorize
        </Button>

        {memorized ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            onClick={() =>
              mark.mutate({ monologueId: monologue.id, memorized: false })
            }
          >
            <IconArrowBackUp className="size-3.5" aria-hidden />
            Move to study
          </button>
        ) : (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            onClick={() =>
              mark.mutate({ monologueId: monologue.id, memorized: true })
            }
          >
            Mark memorized
          </button>
        )}

        <button
          type="button"
          className="text-xs text-muted-foreground/60 underline-offset-4 transition-colors hover:text-foreground hover:underline"
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
    </article>
  );
}

export default CollectionRow;
