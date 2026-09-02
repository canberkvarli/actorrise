"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

import { Monologue } from "@/types/actor";
import { displayableAuthor } from "@/lib/utils";
import type { ProfileMatch } from "@/lib/profileMatch";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";

/**
 * A search result as a page of sides, not a card in a grid.
 *
 * The card version carried three separate badge systems in three colours (a
 * teal match type, an orange profile reason, an amber overdone warning), plus a
 * rank label floating above it that read "Great match" on nearly every result,
 * plus poster, title, play, duration, word count, gender, age, era, emotion,
 * two icon buttons, four lines of excerpt and a footer. Replacing it with a
 * plain row fixed the noise and then overshot: the rank label and the profile
 * reason went with it, and those two say something an actor cannot read off the
 * page. Only "Great match on every row" deserved to go.
 *
 * They come back in a margin. Every row reserves a fixed left column, usually
 * empty, and annotations sit in it as pencil notes aligned to the line they are
 * about. Because the column is reserved whether or not it holds anything, a
 * mark appearing never moves the speech — which is exactly what the flat row
 * could not do, and the reason every mark had to be deleted from it.
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

type Mark = { key: string; label: string; className: string; title?: string };

/**
 * Only the match types that say something. "Great match" on every row is noise,
 * but "you searched this character's name" explains a result that would
 * otherwise look arbitrary, e.g. why "a woman confronting her mother" returns a
 * character called Mother.
 */
const MATCH_LABELS: Record<string, string> = {
  exact_quote: "quote match",
  fuzzy_quote: "quote match",
  title_match: "play match",
  play_match: "play match",
  character_match: "name match",
};

/**
 * Whether the match mark tells the reader anything on this particular set of
 * results.
 *
 * Searching "a woman confronting her mother" returned twenty rows all marked
 * `name match`, at which point the mark distinguishes nothing and is just a
 * word repeated twenty times down the page. Same for a title lookup, where
 * every row obviously belongs to the play you named. The mark earns its place
 * only when it separates some rows from others.
 */
export function matchMarkIsUseful(list: Monologue[]): boolean {
  if (list.length < 2) return list.length === 1 && !!MATCH_LABELS[list[0].match_type ?? ""];
  const marked = list.filter((m) => MATCH_LABELS[m.match_type ?? ""]).length;
  return marked > 0 && marked <= list.length * 0.7;
}

function matchMark(m: Monologue): Mark | null {
  const label = MATCH_LABELS[m.match_type ?? ""];
  if (!label) return null;
  return {
    key: "match",
    label,
    className: "text-muted-foreground/70",
    title: "This came back because it matched the words you typed, not a guess at what you meant.",
  };
}

/**
 * The marks, in priority order. Most rows carry none: that sparseness is what
 * makes one worth reading. `best pick` is index 0 only — an earlier version
 * used `<= 1` and printed it twice.
 */
function marksFor(
  mono: Monologue,
  index: number,
  mode: "plays" | "film_tv",
  profileMatch?: ProfileMatch,
  showMatchMark = true,
): Mark[] {
  const marks: Mark[] = [];
  const match = showMatchMark ? matchMark(mono) : null;
  if (match) marks.push(match);

  // A literal match already explains the row better than its rank does, so the
  // two never both appear.
  if (!match && index === 0) {
    marks.push({
      key: "best",
      label: "best pick",
      className: mode === "film_tv" ? "text-accent-screen" : "text-primary",
      title: "The closest thing to what you asked for.",
    });
  }

  // The recommender's per-piece fit reason was computed on every search and
  // shown nowhere, so a finished profile paid off invisibly. The specific
  // reason is long ("Matches your preferred genre"), so the margin says what it
  // is and the tooltip says why.
  if (profileMatch && profileMatch.score >= 1.5 && profileMatch.reasons.length > 0) {
    marks.push({
      key: "lane",
      label: "your lane",
      className: "text-teal-600 dark:text-teal-400",
      title: profileMatch.reasons[0],
    });
  }

  // Kept because an actor cannot read it off the page: only ~151 of 14.4k
  // pieces score this high, so it stays rare enough to mean something.
  if (mono.overdone_score > 0.7) {
    marks.push({
      key: "overdone",
      label: "everyone brings this",
      className: "text-amber-700 dark:text-amber-500",
      title: "Auditors see this one a lot. Worth knowing before you pick it.",
    });
  }

  return marks;
}

export interface MonologueSpeechProps {
  mono: Monologue;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent, mono: Monologue) => void;
  index?: number;
  isModerator?: boolean;
  onEdit?: (id: number) => void;
  /** Tints `best pick` to the shelf you are on, and decides whether the margin
   *  holds a poster. */
  mode?: "plays" | "film_tv";
  /** From the page's existing profileMatchMap. Drives the `your lane` mark. */
  profileMatch?: ProfileMatch;
  /** False when every row in the result set carries the same match type — see
   *  matchMarkIsUseful. */
  showMatchMark?: boolean;
}

export function MonologueSpeech({
  mono,
  onSelect,
  onToggleFavorite,
  index = 0,
  isModerator = false,
  onEdit,
  mode = "plays",
  profileMatch,
  showMatchMark = true,
}: MonologueSpeechProps) {
  const author = displayableAuthor(mono.author);
  const source = [mono.play_title, author].filter(Boolean).join(", ");
  const length = clock(mono.estimated_duration_seconds);
  const age =
    mono.character_age_range && mono.character_age_range.toLowerCase() !== "any"
      ? mono.character_age_range
      : null;
  const [open, setOpen] = useState(false);

  /** One word of what it sounds like. Stored on every piece and previously
   *  thrown away with the badges; as plain text next to the length it is
   *  information, not decoration. */
  const character = (mono.tone || mono.primary_emotion || "").trim().toLowerCase();
  const colour = character && character !== "unknown" ? character : null;

  const body = mono.text.replace(/\s+/g, " ").trim();
  const shown = excerpt(body);
  const truncated = shown.text.length < body.length;

  const marks = marksFor(mono, index, mode, profileMatch, showMatchMark);
  const poster = mode === "film_tv" ? mono.poster_url : null;

  /* Typed, not set in the UI face. These are notes in the margin of a page of
     sides, and at 11px sans they read as debug output someone forgot to
     remove — the same size and colour as every other label in the app. In the
     typewriter face at 10px with the letters opened up they belong to the
     page the speech is printed on. */
  const markList = (
    <>
      {marks.map((m) => (
        <span
          key={m.key}
          title={m.title}
          className={`font-typewriter text-[10px] uppercase leading-relaxed tracking-[0.12em] ${m.className}`}
        >
          {m.label}
        </span>
      ))}
    </>
  );

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      /* Two cells: the margin, and everything else.
         An earlier version split the right side into three grid rows so a mark
         could line up with the first line of the speech. The poster then set
         row one's height to 144px and stranded the title at the top of a
         100px hole. Nothing needed that alignment badly enough to pay for it —
         a mark annotates the whole entry, and sitting beside the character
         name is where it belongs anyway. */
      className="group border-t border-border/60 py-6 first:border-t-0 first:pt-2 sm:grid sm:grid-cols-[8rem_1fr]"
    >
      {/* Below sm the margin has nowhere to go, so the marks run as one line
          above the name rather than stealing width from the speech. */}
      {marks.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden">
          {markList}
        </div>
      )}

      {/* The margin. The poster was dropped entirely when the cards became
          rows, and at 52px wide when it came back you could not tell one film
          from another. */}
      <div className="hidden sm:flex sm:flex-col sm:items-end sm:gap-3 sm:pr-4 sm:pt-1 sm:text-right">
        {poster && (
          <Image
            src={poster}
            alt=""
            width={96}
            height={144}
            className="h-[144px] w-[96px] rounded-sm object-cover shadow-sm ring-1 ring-border/40 transition-transform duration-300 group-hover:scale-[1.03]"
            unoptimized
          />
        )}
        {markList}
      </div>
      {/* The rule is what makes the empty column read as a margin rather than a
          hole. It runs the height of the entry because this is one cell. */}
      <div className="sm:border-l sm:border-border/40 sm:pl-6">
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
          {/* Length and who it is for: facts about the piece, so they sit with
              the title rather than drifting into the row of things you can do. */}
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {[length, age, colour].filter(Boolean).join(" · ")}
          </span>
        </div>
        {source && (
          <p className="font-typewriter mt-1 truncate text-sm text-muted-foreground">
            {source}
          </p>
        )}

      {/* The piece. This is the whole reason the row exists, so it gets the
          measure and the size of something meant to be read, not scanned.
          Three lines collapsed, the whole speech on click: the full text already
          ships in the search payload, so expanding costs no request and no
          navigation. You can read a piece end to end, decide against it, and
          carry on down the list without losing your place. */}
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
      </div>
      </div>
    </motion.article>
  );
}

export default MonologueSpeech;
