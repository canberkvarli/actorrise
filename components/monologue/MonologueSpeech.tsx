"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { Monologue } from "@/types/actor";
import { displayableAuthor } from "@/lib/utils";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";

/**
 * A search result as a speech on a page, not a card in a grid.
 *
 * The card version carried three separate badge systems in three colours (a
 * teal match type, an orange profile reason, an amber overdone warning), plus a
 * rank label floating above it that read "Great match" on nearly every result,
 * plus poster, title, play, duration, word count, gender, age, era, emotion,
 * two icon buttons, four lines of excerpt and a footer. An actor choosing a
 * piece decides on four things: whose words, where they are from, how long, and
 * how it reads. The rest was the database talking.
 *
 * So the words get the room. Everything else is one line above them and one
 * line below, and the only badge left is the one that says something the actor
 * could not work out by reading: that everyone else is bringing this too.
 */

function clock(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/**
 * Only the match types that say something. "Great match" on every row is noise,
 * but "you searched this character's name" explains a result that would
 * otherwise look arbitrary, e.g. why "a woman confronting her mother" returns a
 * character called Mother.
 */
function meaningfulMatch(m: Monologue): string | null {
  switch (m.match_type) {
    case "exact_quote":
    case "fuzzy_quote":
      return "quote match";
    case "title_match":
      return "play match";
    case "character_match":
      return "name match";
    default:
      return null;
  }
}

export interface MonologueSpeechProps {
  mono: Monologue;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent, mono: Monologue) => void;
  index?: number;
  isModerator?: boolean;
  onEdit?: (id: number) => void;
}

export function MonologueSpeech({
  mono,
  onSelect,
  onToggleFavorite,
  index = 0,
  isModerator = false,
  onEdit,
}: MonologueSpeechProps) {
  const author = displayableAuthor(mono.author);
  const source = [mono.play_title, author].filter(Boolean).join(", ");
  const length = clock(mono.estimated_duration_seconds);
  const age =
    mono.character_age_range && mono.character_age_range.toLowerCase() !== "any"
      ? mono.character_age_range
      : null;
  const match = meaningfulMatch(mono);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="group border-t border-border/60 py-8 first:border-t-0 first:pt-2"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="min-w-0">
          <button
            type="button"
            onClick={onSelect}
            className="font-typewriter break-words text-left text-xl font-semibold leading-tight text-foreground transition-colors hover:text-primary sm:text-2xl"
          >
            {mono.character_name}
          </button>
        </h3>
        {/* Length, who it is for, and why it surfaced: all facts about the
            result, so they sit together rather than one of them drifting down
            into the row of things you can do. */}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {[length, age, match].filter(Boolean).join(" · ")}
        </span>
      </div>

      {source && (
        <p className="font-typewriter mt-1 truncate text-sm text-muted-foreground">
          {source}
        </p>
      )}

      {/* The piece. This is the whole reason the row exists, so it gets the
          measure and the size of something meant to be read, not scanned. */}
      <button
        type="button"
        onClick={onSelect}
        className="mt-4 block w-full text-left"
      >
        <p className="font-typewriter line-clamp-[7] max-w-[64ch] text-[15px] leading-[1.85] text-foreground/85 sm:text-base">
          &ldquo;{mono.text.substring(0, 460)}&hellip;&rdquo;
        </p>
      </button>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <button
          type="button"
          onClick={onSelect}
          className="text-primary underline-offset-4 hover:underline"
        >
          Read
        </button>
        <Link
          href={`/monologue/${mono.id}/work`}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Rehearse
        </Link>
        <button
          type="button"
          onClick={(e) => onToggleFavorite(e, mono)}
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-pressed={mono.is_favorited}
        >
          <BookmarkIcon filled={mono.is_favorited} className="h-4 w-4" />
          {mono.is_favorited ? "Saved" : "Save"}
        </button>
        {isModerator && onEdit && (
          <button
            type="button"
            onClick={() => onEdit(mono.id)}
            className="text-muted-foreground/60 underline-offset-4 hover:text-foreground hover:underline"
          >
            Edit
          </button>
        )}

        {/* Kept because an actor cannot read it off the page: only ~151 of
            14.4k pieces score this high, so it stays rare enough to mean
            something. */}
        {mono.overdone_score > 0.7 && (
          <span className="ml-auto border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            everyone brings this
          </span>
        )}
      </div>
    </motion.article>
  );
}

export default MonologueSpeech;
