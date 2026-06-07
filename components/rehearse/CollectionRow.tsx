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
  index?: number;
}

/**
 * Minimal index row: a large title, a single muted meta line, and a calm
 * status/action on the right (a quiet "Memorize" link, or a lit bulb once
 * off-book). Secondary actions surface on hover (always visible on mobile).
 */
export function CollectionRow({ monologue, index = 0 }: CollectionRowProps) {
  const mark = useToggleMemorized();
  const toggleFavorite = useToggleFavorite();

  const memorized = Boolean(monologue.memorized);
  const hasCut =
    monologue.cut_start_line != null && monologue.cut_end_line != null;
  const duration = formatDuration(monologue.estimated_duration_seconds);
  const memorizeHref = `/monologue/${monologue.id}/memorize`;

  const meta = [monologue.character_name, monologue.play_title, monologue.author]
    .filter(Boolean)
    .join(" · ");

  // Most monologue titles are generic ("Hamlet's speech from Hamlet"), so show
  // the opening line as a synopsis — the quickest "which one is this" cue.
  const opening = monologue.scene_description?.trim()
    || monologue.text?.replace(/\s+/g, " ").trim().slice(0, 140);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1],
        delay: Math.min(index * 0.04, 0.32),
      }}
      className="group -mx-3 flex items-center justify-between gap-6 rounded-lg px-3 py-6 transition-colors hover:bg-muted/30"
    >
      {/* Left: title + one-line meta */}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={memorizeHref}
            className="block min-w-0 truncate text-2xl font-bold leading-snug tracking-tight text-foreground transition-colors hover:text-foreground/70 sm:text-3xl"
          >
            {monologue.title}
          </Link>
          {hasCut && (
            <span
              className="shrink-0 border border-border px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
              title="This monologue has an audition cut"
            >
              ✂ Cut
            </span>
          )}
        </div>
        {meta && (
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {meta}
            {duration && (
              <span className="text-muted-foreground/60"> · {duration}</span>
            )}
          </p>
        )}
        {opening && (
          <p className="mt-1.5 truncate text-sm italic text-muted-foreground/70">
            {opening}
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
    </motion.article>
  );
}

export default CollectionRow;
