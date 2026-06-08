"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { IconBulb, IconBulbFilled } from "@tabler/icons-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { toastBookmark } from "@/lib/toast";
import { Monologue } from "@/types/actor";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useToggleFavorite } from "@/hooks/useBookmarks";

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `~${minutes} min`;
}

// "contemporary" -> "Contemporary", "high-stakes" -> "High-stakes".
function titleCase(value?: string | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

interface CollectionRowProps {
  monologue: Monologue;
  index?: number;
}

/**
 * Collection row: a large title (matching the memorize screen's title font), a
 * clear character/play/author meta line, an opening-line synopsis, and a small
 * set of sharp-cornered info chips. The right rail keeps the calm actions —
 * Remove, Memorize, and a bulb that lights up once the piece is off-book.
 */
export function CollectionRow({ monologue, index = 0 }: CollectionRowProps) {
  const mark = useToggleMemorized();
  const toggleFavorite = useToggleFavorite();
  const queryClient = useQueryClient();

  const memorized = Boolean(monologue.memorized);
  const memorizeHref = `/monologue/${monologue.id}/memorize`;

  // Remove from collection, with an Undo toast that restores the exact item.
  const handleRemove = () => {
    toggleFavorite.mutate({ monologueId: monologue.id, isFavorited: true });
    toastBookmark(false, {
      label: "Monologue",
      duration: 6000,
      onUndo: async () => {
        queryClient.setQueryData<Monologue[]>(["bookmarks"], (old) => {
          const list = old ?? [];
          return list.some((m) => m.id === monologue.id)
            ? list
            : [{ ...monologue, is_favorited: true }, ...list];
        });
        try {
          await api.post(`/api/monologues/${monologue.id}/favorite`);
        } catch {
          toast.error("Couldn't restore. Try again.");
        }
        queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      },
    });
  };

  const meta = [monologue.character_name, monologue.play_title, monologue.author]
    .filter(Boolean)
    .join(" · ");

  // Adaptive title size: longer titles step down so they fit (and wrap) instead
  // of getting cut off. (e.g. "Lady Bracknell's speech from The Importance…")
  const titleLen = monologue.title?.length ?? 0;
  const titleSize =
    titleLen > 54
      ? "text-lg sm:text-xl"
      : titleLen > 36
        ? "text-xl sm:text-2xl"
        : "text-2xl sm:text-3xl";

  // Most monologue titles are generic ("Hamlet's speech from Hamlet"), so lead
  // with the opening line — the quickest "which one is this" cue. A short scene
  // description, when present, sets the stage before the quote.
  const excerpt = monologue.text?.replace(/\s+/g, " ").trim().slice(0, 160);
  const scene = monologue.scene_description?.replace(/\s+/g, " ").trim();
  const synopsis = scene && excerpt
    ? `${scene} — “${excerpt}…”`
    : excerpt
      ? `“${excerpt}…”`
      : scene || null;

  // A few sharp-cornered chips for whatever's present (capped, empties skipped).
  const chips = [
    formatDuration(monologue.estimated_duration_seconds),
    titleCase(monologue.tone),
    titleCase(monologue.primary_emotion),
    titleCase(monologue.category),
    monologue.character_age_range?.trim(),
  ]
    .filter((c): c is string => Boolean(c))
    .slice(0, 4);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1],
        delay: Math.min(index * 0.04, 0.32),
      }}
      className="group -mx-3 flex flex-col gap-4 overflow-hidden rounded-lg px-3 py-6 transition-colors hover:bg-muted/30 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
    >
      {/* Left: title, meta, synopsis, chips */}
      <div className="min-w-0">
        <Link
          href={memorizeHref}
          className={`block min-w-0 text-balance break-words font-bold leading-snug tracking-tight text-foreground transition-colors hover:text-foreground/70 ${titleSize}`}
        >
          {monologue.title}
        </Link>

        {meta && (
          <p className="mt-1.5 truncate text-sm text-muted-foreground">
            {meta}
          </p>
        )}

        {synopsis && (
          <p className="mt-2 line-clamp-2 text-sm italic leading-relaxed text-muted-foreground/70">
            {synopsis}
          </p>
        )}

        {chips.length > 0 && (
          <ul className="mt-3 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <li
                key={chip}
                className="border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {chip}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: Remove (hover) · Memorize · a bulb that lights up once off-book */}
      <div className="flex shrink-0 items-center gap-4 sm:pt-1">
        <button
          type="button"
          className="text-xs text-muted-foreground/70 underline-offset-4 opacity-0 transition-opacity hover:text-foreground hover:underline group-hover:opacity-100 max-sm:opacity-100"
          onClick={handleRemove}
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
