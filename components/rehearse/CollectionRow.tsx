"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { IconBulb, IconBulbFilled } from "@tabler/icons-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

      {/* Right: Remove (hover) · Memorize · a bulb that lights up once off-book */}
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          className="text-xs text-muted-foreground/70 underline-offset-4 opacity-0 transition-opacity hover:text-foreground hover:underline group-hover:opacity-100 max-sm:opacity-100"
          onClick={() =>
            toggleFavorite.mutate({
              monologueId: monologue.id,
              isFavorited: true,
            })
          }
        >
          Remove
        </button>

        <Link
          href={memorizeHref}
          className="shrink-0 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
        >
          Memorize
        </Link>

        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              type="button"
              onClick={() =>
                mark.mutate({ monologueId: monologue.id, memorized: !memorized })
              }
              aria-pressed={memorized}
              whileTap={{ scale: 0.8 }}
              className="shrink-0 rounded-full p-1 cursor-pointer"
            >
              <motion.span
                key={memorized ? "on" : "off"}
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 14 }}
                className="inline-flex"
              >
                {memorized ? (
                  <IconBulbFilled
                    className="size-6 text-amber-400 drop-shadow-[0_0_7px_rgba(251,191,36,0.6)]"
                    aria-hidden
                  />
                ) : (
                  <IconBulb
                    className="size-6 text-muted-foreground/35 transition-colors hover:text-muted-foreground"
                    aria-hidden
                  />
                )}
              </motion.span>
              <span className="sr-only">
                {memorized ? "Memorized" : "Mark as memorized"}
              </span>
            </motion.button>
          </TooltipTrigger>
          <TooltipContent>
            {memorized ? "Memorized — tap to unmark" : "Mark as memorized"}
          </TooltipContent>
        </Tooltip>
      </div>
    </article>
  );
}

export default CollectionRow;
