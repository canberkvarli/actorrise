"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

import { Monologue } from "@/types/actor";
import { displayableAuthor } from "@/lib/utils";
import { entrance } from "@/lib/motion";
import type { ProfileMatch } from "@/lib/profileMatch";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { MonologueSourceTag } from "@/components/search/SourceTag";

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

type MarkTone = "best" | "lane" | "overdone" | "match";
type Mark = { key: string; label: string; tone: MarkTone; title?: string };

/** Roman numerals for the margin. Results are a page of sides; the rank is set
 *  the way a scene number is, not as a digit in a circle. */
function roman(n: number): string {
  const table: [number, string][] = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  let left = n;
  for (const [value, sign] of table) {
    while (left >= value) {
      out += sign;
      left -= value;
    }
  }
  return out;
}

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
    tone: "match",
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
      tone: "best",
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
      tone: "lane",
      title: profileMatch.reasons[0],
    });
  }

  // Kept because an actor cannot read it off the page: only ~151 of 14.4k
  // pieces score this high, so it stays rare enough to mean something.
  if (mono.overdone_score > 0.7) {
    marks.push({
      key: "overdone",
      label: "everyone brings this",
      tone: "overdone",
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
  /** Facts the list has already stated once above the results because every
   *  row shares them — see constantFacts. The same argument as showMatchMark,
   *  applied to the source line: "shakespeare monologue" printed "William
   *  Shakespeare" and "classical" on all 18 rows, and a fact that never varies
   *  within a result set is something to read past, not something to read. */
  omit?: { author?: boolean; era?: boolean };
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
  omit,
}: MonologueSpeechProps) {
  const author = omit?.author ? null : displayableAuthor(mono.author);
  const source = [mono.play_title, author].filter(Boolean).join(", ");
  const length = clock(mono.estimated_duration_seconds);
  const age =
    mono.character_age_range && mono.character_age_range.toLowerCase() !== "any"
      ? mono.character_age_range
      : null;
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  /** One word of what it sounds like. Stored on every piece and previously
   *  thrown away with the badges; as plain text next to the length it is
   *  information, not decoration. */
  const character = (mono.tone || mono.primary_emotion || "").trim().toLowerCase();
  const colour = character && character !== "unknown" ? character : null;

  /** `category` is the play's era. Whitelisted rather than printed as-is: film
   *  and TV rows carry other things in the same column, and "drama piece" next
   *  to a play title would read as a genre claim the data cannot back. */
  const rawEra = (mono.category || "").trim().toLowerCase();
  const era =
    omit?.era || !(rawEra === "classical" || rawEra === "contemporary")
      ? null
      : rawEra;

  const body = mono.text.replace(/\s+/g, " ").trim();
  const shown = excerpt(body);
  const truncated = shown.text.length < body.length;

  const marks = marksFor(mono, index, profileMatch, showMatchMark);
  const poster = mode === "film_tv" ? mono.poster_url : null;

  /* Typed, not set in the UI face. These are notes in the margin of a page of
     sides, and at 11px sans they read as debug output someone forgot to
     remove — the same size and colour as every other label in the app. In the
     typewriter face at 10px with the letters opened up they belong to the
     page the speech is printed on. */
  /* The marks land just behind the row they annotate, so they have to be timed
     off the SAME curve — see lib/motion. They used to run on 0.35 + i*0.09,
     which on an eighteen-row page put the last mark nearly two seconds in,
     long after its own row had settled: the badge appeared to be arriving from
     somewhere else. Rounded rather than exact because it crosses into CSS. */
  const rowDelay = Math.min(0.04 + index * 0.045, 0.34);
  const markList = (
    <>
      {marks.map((m, k) => (
        <span
          key={m.key}
          title={m.title}
          className={`t-mark t-mark--${m.tone}`}
          style={{ ["--mark-d" as string]: `${(rowDelay + 0.18 + k * 0.06).toFixed(2)}s` }}
        >
          {m.label}
        </span>
      ))}
    </>
  );

  return (
    <motion.article
      /* The house entrance (lib/motion), not a bespoke one.
         This was 24px of travel plus a scale from 0.97 on a spring that
         overshoots — on a block of set prose that reads as the type growing
         past its size and settling back, and the per-row delay ran out to
         0.9s, so the eighteenth result arrived long after the reader had
         started on the first. It also ignored prefers-reduced-motion
         entirely. Now the page lands as one wave inside a third of a second. */
      {...entrance(index, { reduce, y: 14, duration: 0.5 })}
      /* Two cells: the margin, and everything else.
         An earlier version split the right side into three grid rows so a mark
         could line up with the first line of the speech. The poster then set
         row one's height to 144px and stranded the title at the top of a
         100px hole. Nothing needed that alignment badly enough to pay for it —
         a mark annotates the whole entry, and sitting beside the character
         name is where it belongs anyway. */
      className="t-row group sm:grid"
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
      <div className="t-row__margin hidden sm:flex">
        <span className="t-row__numeral" aria-hidden>
          {roman(index + 1)}
        </span>
        {poster && (
          <Image
            src={poster}
            alt=""
            width={96}
            height={144}
            className="h-[108px] w-[72px] rounded-sm object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            style={{ border: "1.5px solid var(--t-text)", boxShadow: "4px 4px 0 var(--t-text)" }}
            unoptimized
          />
        )}
        {markList}
      </div>
      {/* The rule is what makes the empty column read as a margin rather than a
          hole. It runs the height of the entry because this is one cell. */}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="min-w-0">
            <button
              type="button"
              onClick={onSelect}
              className="t-row__name break-words text-left"
            >
              {mono.character_name}
            </button>
          </h3>
          {/* Length and who it is for: facts about the piece, so they sit with
              the title rather than drifting into the row of things you can do. */}
          <span className="shrink-0 text-[13px] tabular-nums" style={{ color: "var(--t-muted-dark)" }}>
            {[length, age, colour].filter(Boolean).join(" · ")}
          </span>
        </div>
        {(source || era) && (
          /* Era rides with the play, not with the piece: it says what the
             writing is, which is the first thing an actor screens on and was
             nowhere on the row. Its own flex child and shrink-0, so a long
             title truncates and the era survives — the other way round it was
             the first thing to disappear. */
          <p
            className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1"
            style={{ fontFamily: "var(--t-direction)", fontSize: 14, color: "var(--t-muted-dark-2)" }}
          >
            <span className="truncate">{source}</span>
            {era && <span className="shrink-0 text-[13px]">{era}</span>}
            {/* Which shelf it is off, after the source line — the same pill the
                quick chips and the shelf rows use. */}
            <MonologueSourceTag monologue={mono} />
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
          className="max-w-[64ch]"
          style={{ fontFamily: "var(--t-direction)", fontSize: 15, lineHeight: 1.8, color: "oklch(0.22 0.01 45)" }}
        >
          &ldquo;{open ? body : shown.text}
          {!open && truncated && !shown.endsClean && (
            <span className="text-muted-foreground">…</span>
          )}
          &rdquo;
        </motion.p>
        {truncated && (
          <span className="mt-2 inline-block text-xs underline underline-offset-4" style={{ color: "var(--t-muted-dark-2)" }}>
            {open ? "less" : "read it all"}
          </span>
        )}
      </button>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {/* "Read" is gone: the character name opens the piece, and the speech
            itself now expands in place, so a third control for the same two
            jobs was just a link to argue with. */}
        <Link
          prefetch={false}
          href={`/monologue/${mono.id}/work`}
          onClick={(e) => e.stopPropagation()}
          className="t-rehearse"
        >
          Rehearse
          <span className="t-rehearse__dot" aria-hidden>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </Link>
        <button
          type="button"
          onClick={(e) => onToggleFavorite(e, mono)}
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: mono.is_favorited ? "var(--t-orange-deep)" : "var(--t-muted-dark-2)" }}
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
