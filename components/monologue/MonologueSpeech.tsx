"use client";

import { useState } from "react";
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
 * Cut at the end of a sentence, not mid-phrase.
 *
 * A hard substring left rows ending "You, who wanted my…", which reads as
 * broken rather than continued. Prefers the last sentence terminator in the
 * back half of the window, falls back to a word boundary, and only then to a
 * hard cut.
 */
function excerpt(text: string, limit = 185): { text: string; endsClean: boolean } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return { text: clean, endsClean: true };
  const window = clean.slice(0, limit);
  const sentence = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  // Only honour it if it is not so early that the excerpt becomes a stub.
  if (sentence > limit * 0.5) {
    // A full stop already says the sentence finished. Appending an ellipsis on
    // top of it gave rows ending "dress!…", which reads as a stutter.
    return { text: window.slice(0, sentence + 1), endsClean: true };
  }
  const word = window.lastIndexOf(" ");
  return { text: word > 0 ? window.slice(0, word) : window, endsClean: false };
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
  const [open, setOpen] = useState(false);

  /** One word of what it sounds like. Stored on every piece and previously
   *  thrown away with the badges; as plain text next to the length it is
   *  information, not decoration. */
  const character = (mono.tone || mono.primary_emotion || "").trim().toLowerCase();
  const colour = character && character !== "unknown" ? character : null;

  const body = mono.text.replace(/\s+/g, " ").trim();
  const shown = excerpt(body);
  const truncated = shown.text.length < body.length;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="group border-t border-border/60 py-6 first:border-t-0 first:pt-2"
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
          {[length, age, colour, match].filter(Boolean).join(" · ")}
        </span>
      </div>

      {source && (
        <p className="font-typewriter mt-1 truncate text-sm text-muted-foreground">
          {source}
        </p>
      )}

      {/* The piece. This is the whole reason the row exists, so it gets the
          measure and the size of something meant to be read, not scanned. */}
      {/* Three lines collapsed, the whole speech on click.
          The full text already ships in the search payload, so expanding costs
          no request and no navigation: you can read a piece end to end, decide
          against it, and carry on down the list without losing your place.
          That is the point of a book layout, and the reason the excerpt can
          stay short. Three lines keeps rows at ~230px, so roughly four results
          a screen instead of the 2.6 that seven lines gave. */}
      <button
        type="button"
        onClick={() => truncated && setOpen((v) => !v)}
        aria-expanded={open}
        className={`mt-3 block w-full text-left ${truncated ? "cursor-pointer" : "cursor-default"}`}
      >
        <motion.p
          layout
          className="font-typewriter max-w-[64ch] text-[15px] leading-[1.8] text-foreground/85"
        >
          &ldquo;{open ? body : shown.text}
          {!open && truncated && !shown.endsClean && (
            <span className="text-muted-foreground">…</span>
          )}
          &rdquo;
        </motion.p>
        {truncated && (
          <span className="mt-1.5 inline-block text-xs text-muted-foreground/70 group-hover:text-muted-foreground">
            {open ? "less" : "read it all"}
          </span>
        )}
      </button>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {/* "Read" is gone: the character name opens the piece, and the speech
            itself now expands in place, so a third control for the same two
            jobs was just a link to argue with. */}
        <Link
          href={`/monologue/${mono.id}/work`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-primary underline-offset-4 hover:underline"
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
