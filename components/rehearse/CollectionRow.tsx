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

// "Play" vs "Film & TV" — the source of the piece, for the row's chips.
function sourceLabel(sourceType?: string | null): string | null {
  if (sourceType === "film" || sourceType === "tv") return "Film & TV";
  if (sourceType === "play") return "Play";
  return null;
}

// "Worked today" / "Worked 3 days ago" from an ISO timestamp.
function lastWorkedLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Worked today";
  if (days === 1) return "Worked yesterday";
  if (days < 30) return `Worked ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "Worked a month ago" : `Worked ${months} months ago`;
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
    queryClient.invalidateQueries({ queryKey: ["recently-removed"] });
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
        queryClient.invalidateQueries({ queryKey: ["recently-removed"] });
      },
    });
  };

  /**
   * Lead with the character, not `title`.
   *
   * The stored titles are machine-made and mostly useless — "Hamlet's speech
   * from Hamlet", "King's speech from Hamlet", "Gina's Monologue" — and the old
   * code knew it: it had a comment saying most titles are generic, and then set
   * them in 30px bold anyway. Two Hamlet speeches were indistinguishable at a
   * glance. Every other card in the app leads with the character; this one now
   * does too, and falls back to the title only when there is no character.
   */
  const lead = monologue.character_name?.trim() || monologue.title;
  const source = [monologue.play_title, monologue.author].filter(Boolean).join(" · ");

  // Scene and quote on separate lines. They used to be welded together with an
  // em dash, which made one long grey sentence with a quote buried inside it.
  const excerpt = monologue.text?.replace(/\s+/g, " ").trim().slice(0, 150);
  const scene = monologue.scene_description?.replace(/\s+/g, " ").trim();

  // Plain text with dot separators, not a row of bordered chips: these are
  // facts about the piece, not filters, and four little boxes read as controls.
  const facts = [
    formatDuration(monologue.estimated_duration_seconds),
    sourceLabel(monologue.source_type),
    titleCase(monologue.tone),
    titleCase(monologue.category),
  ].filter((c): c is string => Boolean(c));

  const lastWorked = lastWorkedLabel(monologue.last_studied_at);

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
      className="group relative -mx-3 overflow-hidden rounded-lg px-3 py-6 transition-colors hover:bg-primary/[0.04]"
    >
      {/* Left accent bar: amber once off-book, a quick orange slide-in on hover. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-full transition-all duration-300 ${
          memorized
            ? "bg-amber-400/80"
            : "-translate-x-1 bg-primary opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
        }`}
      />

      {/* One column, held to a readable measure.
          The row used to be flex + justify-between across the full page width,
          which parked the title hard left and Rehearse/Memorize hard right with
          400px of nothing between them. Nothing was near anything it acted on. */}
      <div className="max-w-2xl">
        <h2 className="min-w-0">
          <Link prefetch={false}
            href={`/monologue/${monologue.id}`}
            className="font-typewriter block min-w-0 break-words text-xl font-semibold leading-snug text-foreground transition-colors hover:text-primary sm:text-2xl"
          >
            {lead}
          </Link>
        </h2>

        {source && (
          <p className="font-typewriter mt-1 truncate text-sm text-muted-foreground">
            {source}
          </p>
        )}

        {scene && (
          <p className="mt-3 line-clamp-1 text-sm text-muted-foreground/70">{scene}</p>
        )}
        {excerpt && (
          <p className="font-typewriter mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground/80">
            &ldquo;{excerpt}&hellip;&rdquo;
          </p>
        )}

        {(facts.length > 0 || lastWorked) && (
          <p className="mt-3 text-xs text-muted-foreground/60">
            {[...facts, lastWorked].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* Actions sit under the thing they act on, not across the page from it. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link prefetch={false}
            href={`/monologue/${monologue.id}/work`}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Rehearse
          </Link>
          <Link prefetch={false}
            href={memorizeHref}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Memorize
          </Link>
          <button
            type="button"
            onClick={handleRemove}
            className="text-sm text-muted-foreground/60 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Remove
          </button>

          {/* The bulb was a lone icon floating at the far right of the row. It
              is a toggle, so it lives with the other things you can do; the
              amber accent bar down the left edge already carries the status. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                onClick={() =>
                  mark.mutate({ monologueId: monologue.id, memorized: !memorized })
                }
                aria-pressed={memorized}
                whileTap={{ scale: 0.8 }}
                className="shrink-0 cursor-pointer rounded-full p-1"
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
                      className="size-5 text-amber-400 drop-shadow-[0_0_7px_rgba(251,191,36,0.6)]"
                      aria-hidden
                    />
                  ) : (
                    <IconBulb
                      className="size-5 text-muted-foreground/35 transition-colors hover:text-muted-foreground"
                      aria-hidden
                    />
                  )}
                </motion.span>
                <span className="sr-only">
                  {memorized ? "Off book" : "Mark as off book"}
                </span>
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>
              {memorized ? "Off book. Tap to unmark." : "Mark as off book"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.article>
  );
}

export default CollectionRow;
