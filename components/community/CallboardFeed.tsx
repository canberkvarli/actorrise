"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useCommunityFeed,
  useShareActivity,
  type FeedEvent,
} from "@/hooks/useCommunityFeed";
import { useTrending } from "@/hooks/useTrending";
import { useBookmarks } from "@/hooks/useBookmarks";

/**
 * The Callboard — a stage manager's call sheet.
 *
 * This replaces a pinned-cork-board version that looked the part and failed at
 * the job. Three findings from looking at it on production drove the rewrite:
 *
 *  1. DENSITY WAS BACKWARDS. Twenty items spread over three full screens, with
 *     a metre of blank board at the bottom. A callboard feels alive because it
 *     is crowded; the paper skeuomorphism was spending the exact resource that
 *     produces that feeling in order to imitate it.
 *
 *  2. THE REPETITION WAS BRUTAL. Seven consecutive rows reading "X is looking
 *     for a comedic monologue for a woman in her 18-25". As prose that is one
 *     sentence stuttering. The fix is not a better card — it is to stop writing
 *     sentences and start writing columns. The same seven facts, aligned, are a
 *     pattern you read down in a second and can actually compare.
 *
 *  3. TWO PANELS SAID THE SAME THING. "Sign-in sheet" and "As it happens" were
 *     both "who is here, doing what", so the board showed each actor's name
 *     twice and spent 80% of its area saying it. One roster, one row per actor,
 *     with arriving as just another verb.
 *
 * Motion was restarted from zero along with the layout. There is no staged
 * arrival show any more. At roughly two real events an hour the honest source
 * of life is the clock: timestamps re-render every 20s, a caret blinks at the
 * head of the roster because a cursor means "listening", and a row that truly
 * arrived on the last poll strikes green and holds a pulse. Nothing here
 * animates to imply activity that did not happen.
 */

const SHEET_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Column-width time. "2m", "7h", "1d" — the word "ago" is a whole column of
    nothing repeated fourteen times. */
function compactTime(iso: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (secs < 45) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/** Time actually passes, so the sheet should show it passing. This is the one
    piece of motion on the page that can never be dishonest. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

type Row = {
  id: number;
  name: string;
  verb: string;
  detail: string;
  href: string;
  at: string;
};

function genderNoun(g?: string): string {
  const s = (g || "").toLowerCase();
  if (s.startsWith("f") || s === "woman") return "woman";
  if (s.startsWith("m") || s === "man") return "man";
  return s || "";
}

/** One event, flattened into columns. The verb column is a closed vocabulary
    on purpose: four or five repeated words down a column scan as a category,
    whereas five different phrasings of the same idea scan as noise. */
function toRow(e: FeedEvent): Row | null {
  const p = e.payload;
  /* "Someone", not an em-dash. A dash in a name column reads as missing data
     and makes the row look broken; the anonymity is a real fact about a real
     actor who has not set a name, so say it. */
  const name = e.name && e.name !== "Someone" ? e.name : "Someone";
  const at = e.created_at;
  const piece = p.monologue_id ? `/monologue/${p.monologue_id}` : "/monologues";

  switch (e.event_type) {
    case "joined":
      return { id: e.id, name, verb: "signed in", detail: e.city || "", href: "/monologues", at };
    case "searched": {
      const bits = [p.tone, genderNoun(p.gender), p.age_range, p.emotion].filter(Boolean);
      return {
        id: e.id,
        name,
        verb: "wants",
        detail: bits.join(" · ") || "a monologue",
        href: "/monologues",
        at,
      };
    }
    case "viewed":
      return { id: e.id, name, verb: "reading", detail: p.title || "a monologue", href: piece, at };
    case "bookmarked":
      return { id: e.id, name, verb: "saved", detail: p.title || "a monologue", href: piece, at };
    case "worked":
      return { id: e.id, name, verb: "worked", detail: "out loud", href: "/rehearse", at };
    case "rehearsed":
    case "rehearsing":
      return {
        id: e.id,
        name,
        verb: "rehearsing",
        detail: p.title || "a scene",
        href: "/rehearse",
        at,
      };
    case "shared":
      return { id: e.id, name, verb: "shared", detail: p.title || "a script", href: piece, at };
    case "milestone":
      return {
        id: e.id,
        name,
        verb: "hit",
        detail: `${p.milestone_n} rehearsals`,
        href: "/rehearse",
        at,
      };
    case "trending":
      return { id: e.id, name, verb: "trending", detail: p.title || "", href: piece, at };
    default:
      // went_plus is retired: it published billing status beside a real name.
      return null;
  }
}


/** The play title, unless it just repeats the character's name.

    "Othello · Othello" and "Hamlet · Hamlet" read as a rendering fault, not as
    two facts. A title-role piece genuinely has nothing to add in the second
    column, so the column stays empty rather than echoing. */
function subtitleFor(character?: string | null, play?: string | null): string {
  const c = (character || "").trim().toLowerCase();
  const p = (play || "").trim();
  if (!p) return "";
  return p.toLowerCase() === c ? "" : p;
}

export function CallboardFeed() {
  const { data } = useCommunityFeed(100);
  const { data: trending } = useTrending(7);
  const now = useNow();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const events = useMemo(() => data?.events ?? [], [data]);

  /* Ids that appeared on the last poll, so a genuinely fresh row can announce
     itself. The first payload is not "new" — every row would strike green at
     once and the signal would mean nothing on the one visit it matters. */
  const knownIds = useRef<Set<number> | null>(null);
  const freshIds = useMemo(() => {
    const ids = new Set(events.map((e) => e.id));
    if (knownIds.current === null) {
      knownIds.current = ids;
      return new Set<number>();
    }
    const prev = knownIds.current;
    knownIds.current = ids;
    return new Set([...ids].filter((id) => !prev.has(id)));
  }, [events]);

  /* One row per actor. Searching fires an event per refinement, so a single
     person tuning filters produced five near-identical consecutive rows.
     Keeping each actor's latest turns a log back into a roster of people.
     Anonymous arrivals all come back as "Someone", so they are keyed by id and
     tallied at the foot rather than repeated as a column of em-dashes. */
  const [roster, anonCount] = useMemo(() => {
    const seen = new Set<string>();
    const out: Row[] = [];
    let anon = 0;
    for (const e of events) {
      const named = e.name && e.name !== "Someone";
      if (!named && e.event_type === "joined") {
        anon++;
        continue;
      }
      /* Every unnamed actor keys to the same slot, not to their event id. The
         feed returns them all as "Someone", so keying per event let a single
         anonymous person's bulk saving fill nine of fourteen rows with an
         identical timestamp and an em-dash where the name goes — a roster of
         nobody. One row for the most recent unnamed action is the honest
         amount of space that signal deserves. */
      const who = named ? (e.name as string) : "someone";
      if (seen.has(who)) continue;
      seen.add(who);
      const row = toRow(e);
      if (row) out.push(row);
      if (out.length === 14) break;
    }
    return [out, anon] as const;
  }, [events]);

  const searchTags = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (v?: string) => v && counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const e of events) {
      if (e.event_type !== "searched") continue;
      const p = e.payload;
      bump(p.tone);
      bump(p.gender === "female" ? "women" : p.gender === "male" ? "men" : p.gender);
      bump(p.age_range);
      bump(p.emotion);
      (p.themes ?? []).forEach((t) => bump(t));
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [events]);

  const counts = useMemo(() => {
    const searched = events.filter((e) => e.event_type === "searched").length;
    const joined = events.filter((e) => e.event_type === "joined").length;
    return { searched, joined };
  }, [events]);

  if (!mounted || !data) return <SheetSkeleton />;

  const headline = trending?.[0];
  /* Deduped on character + play, not on id. Trending returns separate rows for
     the same speech ingested from different sources, which billed "HAMLET ·
     Hamlet" twice in a row and read as a rendering fault rather than as two
     genuinely different pieces. */
  const alsoBilled = (() => {
    const seen = new Set<string>();
    const out: NonNullable<typeof trending> = [];
    for (const m of trending ?? []) {
      const key = `${m.character_name}|${m.play_title}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out.slice(1, 6);
  })();
  const windowLabel = data.window === "today" ? "today" : "this week";

  return (
    <div className="callsheet min-h-screen px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <div className="mx-auto w-full max-w-5xl">
        {/* ── Header block ─────────────────────────────────────────────────
            A call sheet states the show, the date and the numbers, then gets
            out of the way. It does not have a hero. */}
        <header>
          <p className="font-typewriter text-[11px] uppercase tracking-[0.3em] text-[var(--sheet-faint)]">
            The house, before curtain
          </p>
          <h1 className="font-playbill mt-2 text-[clamp(3rem,11vw,6.5rem)] leading-[0.85] tracking-[-0.01em] text-[var(--sheet-ink)]">
            The Callboard
          </h1>

          {/* The numbers sit on one ruled line, tabular, like a call sheet's
              header strip — not as four big stat tiles, which is how the
              previous version shipped a permanent prominent 0. */}
          <div className="mt-6 border-y border-[var(--sheet-rule)] py-2.5">
            <p className="flex flex-wrap items-baseline gap-x-7 gap-y-1.5 font-typewriter text-[13px]">
              <div className="text-[var(--sheet-dim)]">{SHEET_DATE.format(new Date())}</div>
              <Stat n={data.actor_count} label={`in the house ${windowLabel}`} />
              {counts.searched > 0 && <Stat n={counts.searched} label="searches" />}
              {counts.joined > 0 && <Stat n={counts.joined} label="new faces" />}
            </p>
          </div>
        </header>

        {/* ── Your call ────────────────────────────────────────────────────
            Everything else on this sheet is other people. Without this the
            board is a page an actor admires rather than one they return to:
            nothing on it is addressed to them, so there is no reason it should
            be open on a Tuesday. A real callboard carries the whole company's
            names AND yours, and yours is the line you look for first. */}
        <YourCall />

        {/* ── Billing + what the house wants, side by side ─────────────────
            Two things that are each too small to hold a screen on their own,
            so they share one band and the roster gets the full width below. */}
        {/* Three bands, not two. At two columns the billing ran long on the
            left while the tag list ended halfway down the right, leaving a
            column of dead board — the exact failure the pinboard version was
            rebuilt to escape. Splitting "Also billed" into its own band evens
            the three heights and buys back the space. */}
        <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-[1.15fr_1fr_1fr]">
          <section>
            <SectionRule>Tonight&rsquo;s bill</SectionRule>
            {headline && (
              <Link href={`/monologue/${headline.id}`} className="group mt-4 block">
                <p className="font-playbill text-[clamp(2rem,5.5vw,3.25rem)] leading-[0.95] text-[var(--sheet-ink)] transition-colors group-hover:text-primary">
                  {headline.character_name}
                </p>
                <p className="mt-1.5 font-typewriter text-sm text-[var(--sheet-dim)]">
                  {headline.play_title}
                  {headline.author ? ` · ${headline.author}` : ""}
                </p>
                {/* The character name alone is a link with no affordance — on a
                    sheet where every other row is also clickable, nothing marks
                    this as the one thing the page is actually recommending. */}
                <span className="mt-4 inline-flex items-center gap-1.5 border-b border-primary/50 pb-0.5 font-typewriter text-[13px] font-semibold uppercase tracking-[0.12em] text-primary">
                  Read it
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </Link>
            )}

          </section>

          <section>
            <SectionRule>Also billed</SectionRule>
            {alsoBilled.length > 0 && (
              <ul className="mt-4 border-t border-[var(--sheet-rule)]">
                {alsoBilled.map((m, i) => (
                  <li
                    key={m.id}
                    className="sheet-row sheet-row-hit border-b border-[var(--sheet-rule)]"
                    style={{ "--row-delay": `${140 + i * 40}ms` } as React.CSSProperties}
                  >
                    <Link
                      href={`/monologue/${m.id}`}
                      className="flex items-baseline gap-3 py-2 font-typewriter text-[13px]"
                    >
                      <span className="shrink-0 font-semibold uppercase tracking-wide text-[var(--sheet-ink)]">
                        {m.character_name}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[var(--sheet-faint)]">
                        {subtitleFor(m.character_name, m.play_title)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sm:col-span-2 lg:col-span-1">
            <SectionRule>The house is hunting for</SectionRule>
            {/* Every tag runs that search. The previous version rendered the
                same list as inert spans, which put twelve dead ends on the one
                panel that describes live demand. */}
            <div className="mt-4 flex flex-wrap gap-x-1.5 gap-y-2">
              {searchTags.map(([tag, n], i) => (
                <Link
                  key={tag}
                  href={`/monologues?q=${encodeURIComponent(tag)}`}
                  style={{ "--row-delay": `${180 + i * 30}ms` } as React.CSSProperties}
                  className={`sheet-row border px-2 py-1 font-typewriter text-[13px] capitalize transition-colors hover:border-primary hover:text-primary ${
                    n > 2
                      ? "border-[var(--sheet-dim)] font-semibold text-[var(--sheet-ink)]"
                      : "border-[var(--sheet-rule)] text-[var(--sheet-dim)]"
                  }`}
                >
                  {tag}
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* ── The roster ───────────────────────────────────────────────────
            The main event, full width. Arriving is just another verb here, so
            nobody appears twice on one sheet. */}
        <section className="mt-12">
          <SectionRule>
            In the house
            <span aria-hidden className="sheet-caret ml-2 text-primary">
              ▮
            </span>
          </SectionRule>

          <ul className="mt-3 border-t border-[var(--sheet-rule)]">
            {roster.map((r, i) => {
              const fresh = freshIds.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`sheet-row sheet-row-hit border-b border-[var(--sheet-rule)] ${
                    fresh ? "sheet-fresh" : ""
                  }`}
                  style={{ "--row-delay": `${i * 32}ms` } as React.CSSProperties}
                >
                  <Link
                    href={r.href}
                    className="group flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 font-typewriter text-[13px] sm:grid sm:grid-cols-[0.6rem_minmax(0,9rem)_5.5rem_minmax(0,1fr)_2.5rem_0.9rem] sm:items-center sm:gap-x-4 sm:gap-y-0"
                  >
                    <span className="flex h-2 w-2 shrink-0 items-center sm:w-[0.6rem]">
                      {fresh && (
                        <>
                          <span
                            aria-hidden
                            className="sheet-live-dot h-1.5 w-1.5 rounded-full"
                          />
                          {/* The pulse was the board's only "this just
                              arrived" signal and it was aria-hidden with
                              nothing in its place, so the one genuinely live
                              thing on the page existed for sighted users
                              only. */}
                          <span className="sr-only">Just now: </span>
                        </>
                      )}
                    </span>
                    <span className="truncate text-[15px] font-semibold text-[var(--sheet-ink)] sm:text-[13px]">
                      {r.name}
                    </span>
                    <span className="shrink-0 uppercase tracking-[0.08em] text-[var(--sheet-faint)]">
                      {r.verb}
                    </span>
                    {/* pl-5 matches the status-dot column, which only exists on
                        the first line once the row wraps — without it the
                        detail hangs to the left of the name it belongs to. */}
                    <span className="order-last min-w-0 basis-full truncate pl-5 text-[var(--sheet-dim)] sm:order-none sm:basis-auto sm:pl-0">
                      {r.detail}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums text-[var(--sheet-faint)] sm:ml-0 sm:text-right">
                      {compactTime(r.at, now)}
                    </span>
                    <span
                      aria-hidden
                      className="hidden text-primary opacity-0 transition-opacity group-hover:opacity-100 sm:inline"
                    >
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {anonCount > 0 && (
            <p className="mt-3 font-typewriter text-[13px] text-[var(--sheet-faint)]">
              + {anonCount} who haven&rsquo;t signed their name yet
            </p>
          )}
        </section>

        <VisibilityStamp />
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  /* Not a description list any more.

     I had written this as <dl>/<dt>/<dd> with the <dd> first, which is invalid.
     Putting the <dt> first fixed the HTML and broke the reading: a description
     list is read term-then-description, so it announced "in the house today,
     12" while the design needs the number to come first visually. Reversing the
     DOM back to fix the reading re-breaks the markup.

     The list semantics were never earning anything here — this is one short
     line of stamped text, not a glossary. A plain span with the visual pieces
     hidden and the whole phrase exposed once says exactly the right thing in
     both directions. */
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="sr-only">
        {n} {label}
      </span>
      <span aria-hidden className="tabular-nums text-[15px] font-semibold text-[var(--sheet-ink)]">
        {n}
      </span>
      <span aria-hidden className="uppercase tracking-[0.12em] text-[var(--sheet-faint)]">
        {label}
      </span>
    </span>
  );
}

function SectionRule({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="sheet-rule font-typewriter text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sheet-dim)]">
      <span>{children}</span>
    </h2>
  );
}

/** The visibility control, set as a line of small print at the foot of the
    sheet the way a real call sheet carries its notices. */
function VisibilityStamp() {
  const { shareActivity, isLoading, setShareActivity } = useShareActivity();
  if (isLoading || shareActivity === undefined) return null;
  return (
    <div className="mt-14 border-t border-[var(--sheet-rule)] pt-4">
      <button
        type="button"
        onClick={() => setShareActivity(!shareActivity)}
        className="font-typewriter text-[11px] uppercase tracking-[0.2em] text-[var(--sheet-faint)] underline-offset-4 transition-colors hover:text-[var(--sheet-ink)] hover:underline"
      >
        {shareActivity
          ? "You are on this sheet · take me off"
          : "You are off this sheet · put me back"}
      </button>
    </div>
  );
}

/** Hairlines only. The sheet's own structure is the loading state, so nothing
    moves position when the data lands. */
function SheetSkeleton() {
  return (
    <div className="callsheet min-h-screen px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="h-3 w-48 bg-[var(--sheet-rule)]" />
        <div className="mt-4 h-[clamp(3rem,11vw,6.5rem)] w-full max-w-2xl bg-[var(--sheet-raised)]" />
        <div className="mt-6 border-y border-[var(--sheet-rule)] py-2.5">
          <div className="h-3 w-72 bg-[var(--sheet-rule)]" />
        </div>
        <div className="mt-12 border-t border-[var(--sheet-rule)]">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="border-b border-[var(--sheet-rule)] py-3.5">
              <div
                className="h-3 bg-[var(--sheet-raised)]"
                style={{ width: `${34 + ((i * 13) % 46)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The actor's own line on the board.
 *
 * Deliberately the shortest section here: it is a reminder, not a dashboard.
 * The collection page already does inventory properly, so repeating it would
 * only mean two screens doing one job worse. This says the one useful thing —
 * the piece you are on — and gets out of the way.
 *
 * Renders nothing for an actor with an empty shelf. On the board, "you have
 * nothing saved" would be a scolding from a page they came to for company.
 */
function YourCall() {
  const { data } = useBookmarks();
  const mine = Array.isArray(data) ? data : [];
  if (mine.length === 0) return null;

  const current = mine[0];
  const rest = mine.length - 1;

  return (
    <section className="mt-10">
      <SectionRule>Your call</SectionRule>
      <div className="mt-3 border-t border-[var(--sheet-rule)]">
        <div className="sheet-row sheet-row-hit border-b border-[var(--sheet-rule)]">
          <Link
            href={`/monologue/${current.id}`}
            className="group flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-3 font-typewriter text-[13px]"
          >
            <span className="text-[15px] font-semibold text-[var(--sheet-ink)] sm:text-[13px]">
              {current.character_name}
            </span>
            <span className="min-w-0 flex-1 truncate text-[var(--sheet-dim)]">
              {subtitleFor(current.character_name, current.play_title)}
            </span>
            <span className="shrink-0 uppercase tracking-[0.08em] text-primary">
              Rehearse →
            </span>
          </Link>
        </div>
      </div>
      {rest > 0 && (
        <p className="mt-2.5 font-typewriter text-[13px] text-[var(--sheet-faint)]">
          <Link href="/rehearse" className="underline-offset-4 hover:text-[var(--sheet-ink)] hover:underline">
            + {rest} more on your shelf
          </Link>
        </p>
      )}
    </section>
  );
}
