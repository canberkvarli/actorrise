"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  useCommunityFeed,
  useShareActivity,
  type FeedEvent,
} from "@/hooks/useCommunityFeed";
import { useTrending } from "@/hooks/useTrending";
import { Avatar, EventLine, chipFor, relativeTime } from "./eventRender";
import { BEAT, useBoardReveal } from "./useBoardReveal";

/**
 * The Callboard — the board itself, not a feed wearing its name.
 *
 * Backstage a callboard is a physical object: a dark board under a work light,
 * notices pinned at angles by the stage manager, a sign-in sheet down one side.
 * This renders that object. Everything pinned to it is a door — a notice you
 * can act on — because a real callboard exists to be obeyed, not admired.
 *
 * The board is alive in three separate registers, and they are deliberately
 * different from each other:
 *
 *  1. THE ARRIVAL. The day gets pinned up in front of you over ~3.8s. Staged
 *     timing, real events. See useBoardReveal for why this is not realtime.
 *  2. THE AMBIENT. Once settled, the work light drifts and the paper breathes
 *     on out-of-phase cycles. Pure CSS, no JS, no re-render.
 *  3. THE LIVE PIN. When the 25s poll returns an event that was not there
 *     before, that one row pins itself in and wears a green pulse until the
 *     next poll. Rare — which is exactly why it should be unmistakable.
 *
 * Two things this deliberately drops from earlier versions:
 *
 *  - The four-up stat grid. One of its cells was "rehearsals", and `rehearsed`
 *    has fired twice in the product's entire history, so the page shipped a
 *    permanent, prominent 0.
 *  - Hover-to-reveal action chips. Hover does not exist on a phone, so on
 *    mobile every row in the live feed linked precisely nowhere.
 */

/* Deterministic tilt from the notice's own identity. Math.random() here would
   reshuffle every card on every 25s refetch, which is the exact thing that
   makes fake-scatter look cheap. */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function tilt(seed: string, spread = 2.2): string {
  return `${((hash(seed) % 200) / 100 - 1) * spread}deg`;
}
/* Sway phase, so the board never breathes as one slab. */
function sway(seed: string): string {
  return `-${(hash(seed + "s") % 110) / 10}s`;
}

const STAMP_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Gels are chosen by eye on real data, not argued about in the abstract.
    `?gel=oxblood|slate|cork` swaps the board's palette and remembers it. */
function useGel(): string {
  const [gel, setGel] = useState("ink");
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("gel");
      if (q) {
        localStorage.setItem("callboard:gel", q);
        setGel(q);
      } else {
        setGel(localStorage.getItem("callboard:gel") || "ink");
      }
    } catch {
      /* ignore */
    }
  }, []);
  return gel;
}

export function CallboardFeed() {
  const { data } = useCommunityFeed(100);
  const { data: trending } = useTrending(7);
  const reduceMotion = useReducedMotion();
  const gel = useGel();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ready = mounted && !!data;
  const { playing, settled, cue } = useBoardReveal(ready);

  const events = useMemo(() => data?.events ?? [], [data]);
  const joined = useMemo(() => events.filter((e) => e.event_type === "joined"), [events]);
  const searched = useMemo(() => events.filter((e) => e.event_type === "searched"), [events]);

  /* Which ids are new *since the last poll*, so a genuinely fresh event can
     announce itself. The first payload is not "new" — everything would pulse
     at once and the signal would mean nothing on the one visit it matters. */
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

  /* Arrivals live on the sign-in sheet, so they come out of the running feed —
     otherwise the same person appears twice on one board, and every third row
     of "as it happens" is someone who has not done anything yet.

     Then one row per actor. Searching fires an event per refinement, so a
     single person tuning their filters produced five near-identical rows in a
     row. Keeping only each actor's latest turns that back into a board of
     people rather than a log. */
  const doings = useMemo(() => {
    const seen = new Set<string>();
    const out: FeedEvent[] = [];
    for (const e of events) {
      if (e.event_type === "joined") continue;
      const who = e.name || String(e.id);
      if (seen.has(who)) continue;
      seen.add(who);
      out.push(e);
      if (out.length === 9) break;
    }
    return out;
  }, [events]);

  /* Arrivals who have not set a name come back as "Someone". Three "Someone"
     rows on a sign-in sheet reads as a rendering fault; as a tally at the foot
     of the sheet it reads as what it is. */
  const [named, anonCount] = useMemo(() => {
    const withName = joined.filter((e) => e.name && e.name !== "Someone");
    return [withName.slice(0, 7), joined.length - withName.length] as const;
  }, [joined]);

  const searchTags = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (v?: string) => v && counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const e of searched) {
      const p = e.payload;
      bump(p.tone);
      bump(p.gender === "female" ? "women" : p.gender === "male" ? "men" : p.gender);
      bump(p.age_range);
      bump(p.emotion);
      (p.themes ?? []).forEach((t) => bump(t));
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [searched]);

  if (!ready || !data) return <BoardSkeleton />;

  const headline = trending?.[0];
  const alsoBilled = (trending ?? []).slice(1, 6);
  const windowLabel = data.window === "today" ? "today" : "this week";

  return (
    <div className="px-3 pb-24 pt-5 sm:px-6 sm:pt-10">
      <div
        data-gel={gel}
        className={`callboard callboard-frame stage-grain relative isolate mx-auto w-full max-w-5xl overflow-hidden px-4 pb-10 pt-8 sm:px-9 sm:pb-16 sm:pt-14 ${
          settled ? "callboard-settled" : ""
        }`}
      >
        {/* The work light, thrown from up and left. Sits under everything. */}
        <div className="callboard-light" aria-hidden />

        <div className="relative z-10">
          {/* ── The masthead, screenprinted onto the board itself ─────────── */}
          <header className="mb-9 sm:mb-14">
            <motion.p
              initial={playing ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={cue(BEAT.stamp)}
              className="font-typewriter text-xs italic tracking-wide text-[var(--board-light)]/70 sm:text-sm"
            >
              (the house, before curtain.)
            </motion.p>

            {/* Breaks its own frame: the title runs wider than the board's
                padding and clips at the edge, the way a screenprint laid down
                slightly off-register actually does. */}
            <h1
              className={`font-playbill -ml-1 mt-1 text-[clamp(3.25rem,15.5vw,8.5rem)] leading-[0.86] tracking-[-0.015em] text-[var(--board-card)] sm:-ml-2 ${
                playing ? "board-stamp" : ""
              }`}
              style={{
                textShadow:
                  "0 1px 0 color-mix(in oklab, black 55%, transparent), 0 14px 34px color-mix(in oklab, black 60%, transparent)",
              }}
            >
              The Callboard
            </h1>

            <motion.div
              initial={playing ? { scaleX: 0 } : false}
              animate={{ scaleX: 1 }}
              transition={
                playing
                  ? { duration: 0.5, delay: BEAT.rule, ease: [0.22, 1, 0.36, 1] }
                  : { duration: 0 }
              }
              style={{ transformOrigin: "left" }}
              className="mt-5 h-px w-full bg-[color-mix(in_oklab,var(--board-card)_28%,transparent)]"
            />

            {/* Numbers count up rather than appear. A number that arrives at a
                value has visibly been counted; one that is simply printed has
                not. */}
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-typewriter text-[11px] uppercase tracking-[0.2em] text-[color-mix(in_oklab,var(--board-card)_62%,transparent)] sm:text-[13px]">
              <span>{STAMP_DATE.format(new Date())}</span>
              <Sep />
              <span>
                <Count to={data.actor_count} play={playing} at={BEAT.counts} /> in the house{" "}
                {windowLabel}
              </span>
              {searched.length > 0 && (
                <>
                  <Sep />
                  <span>
                    <Count to={searched.length} play={playing} at={BEAT.counts + 0.1} /> searches
                  </span>
                </>
              )}
              {joined.length > 0 && (
                <>
                  <Sep />
                  <span>
                    <Count to={joined.length} play={playing} at={BEAT.counts + 0.2} /> new faces
                  </span>
                </>
              )}
            </p>
          </header>

          {/* ── The notices ─────────────────────────────────────────────────
              Explicit columns, not CSS columns and not a grid. CSS columns
              dropped notices into a void (Chrome cannot break a
              `break-inside-avoid` card, so a tall feed threw the balance); a
              grid makes every card inherit the tallest one's height. Explicit
              columns do neither, and they let the board be *composed* — the
              standing notices on the left, the moving ones on the right. */}

          {/* Top billing runs wide and off-centre, and the columns tuck up
              underneath its bottom edge. A sheet spanning the full width with
              its text in the left third reads as a layout that failed; a poster
              pinned off-register, overlapping what is behind it, reads as a
              poster. */}
          {headline && (
            <div className="relative z-20 mb-4 sm:mb-2 sm:w-[74%]">
              <Notice
                seed={`top-${headline.id}`}
                at={BEAT.billing}
                cue={cue}
                playing={playing}
                label="Top billing"
              >
                <Link href={`/monologue/${headline.id}`} className="group block">
                  <p className="font-playbill text-[clamp(2.4rem,8.5vw,4.25rem)] leading-[0.92] text-[var(--board-ink)] transition-colors group-hover:text-primary">
                    {headline.character_name}
                  </p>
                  <p className="mt-2.5 font-typewriter text-[15px] text-[var(--board-muted)]">
                    {headline.play_title}
                    {headline.author ? ` · ${headline.author}` : ""}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 border-b-2 border-primary/60 pb-0.5 text-[15px] font-semibold text-primary">
                    Read it
                    <span aria-hidden className="transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </Link>
              </Notice>
            </div>
          )}

          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <div className="flex flex-1 flex-col gap-5 sm:gap-7 sm:pt-8">
              {(named.length > 0 || anonCount > 0) && (
                <Notice
                  seed="signin"
                  at={BEAT.signin}
                  cue={cue}
                  playing={playing}
                  label="Sign-in sheet"
                >
                  <ul>
                    {named.map((e, i) => (
                      <motion.li
                        key={e.id}
                        initial={playing ? { opacity: 0, x: -14 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={cue(BEAT.signin + 0.2, { stagger: 0.09, index: i })}
                        className="flex items-center gap-3 border-b border-dashed border-[var(--board-rule)] py-2.5 last:border-b-0"
                      >
                        <Avatar e={e} size={32} />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-[var(--board-ink)]">
                          {e.name}
                        </span>
                        {e.city && (
                          <span className="hidden shrink-0 font-typewriter text-xs text-[var(--board-muted)] min-[420px]:inline">
                            {e.city}
                          </span>
                        )}
                        <Stamp fresh={freshIds.has(e.id)}>{relativeTime(e.created_at)}</Stamp>
                      </motion.li>
                    ))}
                  </ul>
                  {anonCount > 0 && (
                    <p className="mt-3 font-typewriter text-[13px] text-[var(--board-muted)]">
                      + {anonCount} who haven&rsquo;t signed their name yet
                    </p>
                  )}
                </Notice>
              )}

              {searchTags.length > 0 && (
                <Notice
                  seed="hunting"
                  at={BEAT.hunting}
                  cue={cue}
                  playing={playing}
                  label="The house is hunting for"
                >
                  {/* Each tag runs that search rather than dumping you on an
                      empty /monologues. They scatter in from their own offsets
                      rather than fading as a block — twelve things fading in
                      together is one thing fading in. */}
                  <div className="flex flex-wrap gap-x-2 gap-y-2.5">
                    {searchTags.map(([tag, count], i) => (
                      <motion.span
                        key={tag}
                        initial={
                          playing
                            ? {
                                opacity: 0,
                                y: (hash(tag) % 18) - 9,
                                x: (hash(tag + "x") % 18) - 9,
                                rotate: (hash(tag + "r") % 14) - 7,
                              }
                            : false
                        }
                        animate={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
                        transition={cue(BEAT.hunting + 0.18, { stagger: 0.035, index: i })}
                      >
                        <Link
                          href={`/monologues?q=${encodeURIComponent(tag)}`}
                          className={`inline-block border px-2.5 py-1 font-typewriter capitalize transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary ${
                            count > 2
                              ? "border-[var(--board-ink)]/45 text-[15px] font-semibold text-[var(--board-ink)]"
                              : "border-[var(--board-rule)] text-sm text-[var(--board-muted)]"
                          }`}
                        >
                          {tag}
                        </Link>
                      </motion.span>
                    ))}
                  </div>
                </Notice>
              )}
            </div>

            {/* Overlaps the left column by a hair on desktop, so the two read
                as paper laid over paper rather than as two table cells. */}
            <div className="flex flex-1 flex-col gap-5 sm:-ml-4 sm:gap-7">
              {doings.length > 0 && (
                <Notice
                  seed="asithappens"
                  at={BEAT.happening}
                  cue={cue}
                  playing={playing}
                  label="As it happens"
                >
                  <ul>
                    {doings.map((e, i) => {
                      const chip = chipFor(e);
                      const fresh = freshIds.has(e.id);
                      return (
                        <motion.li
                          key={e.id}
                          /* A row that shows up on a later poll was not part of
                             the replay, so it gets the drop-and-settle on its
                             own — the same vocabulary the actor just watched,
                             which is what makes it legible as the board doing
                             its thing rather than a glitch. */
                          initial={
                            playing || fresh ? { opacity: 0, y: -16, rotate: fresh ? -1.5 : 0 } : false
                          }
                          animate={{ opacity: 1, y: 0, rotate: 0 }}
                          transition={cue(BEAT.happening + 0.2, { stagger: 0.07, index: i })}
                          className="border-b border-dashed border-[var(--board-rule)] py-3 last:border-b-0"
                        >
                          <p className="text-[15px] leading-snug text-[var(--board-muted)]">
                            <span className="font-semibold text-[var(--board-ink)]">{e.name}</span>{" "}
                            <EventLine e={e} />
                          </p>
                          <p className="mt-1.5 flex items-center gap-3">
                            <Stamp fresh={fresh}>{relativeTime(e.created_at)}</Stamp>
                            {chip && (
                              <Link
                                href={chip.href}
                                className="text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
                              >
                                {chip.label} →
                              </Link>
                            )}
                          </p>
                        </motion.li>
                      );
                    })}
                  </ul>
                </Notice>
              )}

              {alsoBilled.length > 0 && (
                <Notice
                  seed="also"
                  at={BEAT.also}
                  cue={cue}
                  playing={playing}
                  label="Also billed"
                >
                  <ul>
                    {alsoBilled.map((m, i) => (
                      <motion.li
                        key={m.id}
                        initial={playing ? { opacity: 0, y: -8 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={cue(BEAT.also + 0.15, { stagger: 0.06, index: i })}
                        className="border-b border-dashed border-[var(--board-rule)] last:border-b-0"
                      >
                        <Link
                          href={`/monologue/${m.id}`}
                          className="group flex items-baseline gap-2 py-2.5"
                        >
                          <span className="font-playbill text-xl text-[var(--board-ink)] transition-colors group-hover:text-primary">
                            {m.character_name}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-typewriter text-[13px] text-[var(--board-muted)]">
                            {m.play_title}
                          </span>
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                </Notice>
              )}
            </div>
          </div>

          <VisibilityStamp />
        </div>
      </div>
    </div>
  );
}

function Sep() {
  return (
    <span aria-hidden className="opacity-40">
      ·
    </span>
  );
}

/** A timestamp, wearing a live pulse if this row arrived on the last poll. */
function Stamp({ fresh, children }: { fresh: boolean; children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-typewriter text-xs text-[var(--board-muted)]">
      {fresh && <span aria-hidden className="board-live-dot h-1.5 w-1.5 rounded-full" />}
      {children}
    </span>
  );
}

/** A number that arrives at its value instead of being printed at it. */
function Count({ to, play, at }: { to: number; play: boolean; at: number }) {
  const [n, setN] = useState(play ? 0 : to);

  useEffect(() => {
    if (!play) {
      setN(to);
      return;
    }
    let raf = 0;
    const dur = 1100;
    const start = performance.now() + at * 1000;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / dur));
      // easeOutExpo: fast off the mark, then a long deliberate settle, which is
      // what makes it read as counting rather than as a slider being dragged.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setN(Math.round(eased * to));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, play, at]);

  return <span className="tabular-nums text-[var(--board-card)]">{n}</span>;
}

/** A sheet of paper, tacked to the board. */
function Notice({
  seed,
  at,
  cue,
  playing,
  label,
  children,
}: {
  seed: string;
  at: number;
  cue: (at: number, extra?: { stagger?: number; index?: number }) => object;
  playing: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      /* The wrapper owns the entrance (drop in from above the frame, overshoot,
         settle — as if pinned up one at a time); the inner .callboard-notice
         owns the resting tilt and the ambient sway in CSS. Two elements because
         all three want `transform`. */
      initial={playing ? { opacity: 0, y: -46, rotate: -2.5 } : false}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={cue(at)}
    >
      <div
        className="callboard-notice px-4 pb-4 pt-8 sm:px-6 sm:pb-6 sm:pt-9"
        style={
          { "--tilt": tilt(seed), "--sway": sway(seed) } as React.CSSProperties
        }
      >
        <Tack at={at} playing={playing} />
        <h2 className="mb-4 flex items-center gap-3 font-typewriter text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--board-muted)] sm:text-[13px]">
          {label}
          <span aria-hidden className="h-px flex-1 bg-[var(--board-rule)]" />
        </h2>
        {children}
      </div>
    </motion.div>
  );
}

/** Brass pin. Highlight up and left, shadow down and right. Lands 90ms after
    the paper it holds — the pin goes in second, not first. */
function Tack({ at, playing }: { at: number; playing: boolean }) {
  return (
    <motion.span
      aria-hidden
      initial={playing ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        playing
          ? { type: "spring", stiffness: 500, damping: 16, delay: at + 0.09 }
          : { duration: 0 }
      }
      className="absolute left-1/2 top-2.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full"
      style={{
        background:
          "radial-gradient(circle at 32% 28%, oklch(0.92 0.09 85), oklch(0.68 0.15 62) 55%, oklch(0.45 0.11 55))",
        boxShadow:
          "0 2px 4px color-mix(in oklab, black 55%, transparent), 0 0 0 1px color-mix(in oklab, black 25%, transparent)",
      }}
    />
  );
}

/** The visibility control, stamped at the foot of the board like a notice from
    the office rather than a stray link. */
function VisibilityStamp() {
  const { shareActivity, isLoading, setShareActivity } = useShareActivity();
  if (isLoading || shareActivity === undefined) return null;
  return (
    <div className="mt-12 border-t border-[color-mix(in_oklab,var(--board-card)_20%,transparent)] pt-5 sm:mt-16">
      <button
        type="button"
        onClick={() => setShareActivity(!shareActivity)}
        className="font-typewriter text-[11px] uppercase tracking-[0.18em] text-[color-mix(in_oklab,var(--board-card)_55%,transparent)] underline-offset-4 transition-colors hover:text-[var(--board-card)] hover:underline sm:text-xs"
      >
        {shareActivity
          ? "You are on this board · take me off"
          : "You are off this board · put me back"}
      </button>
    </div>
  );
}

/** Bare cork under the work light. Deliberately empty of card shapes: the
    replay begins with a board that has nothing on it, so a skeleton showing
    four grey rectangles would spoil the first beat of the show. */
function BoardSkeleton() {
  return (
    <div className="px-3 pb-24 pt-5 sm:px-6 sm:pt-10">
      <div className="callboard callboard-frame stage-grain relative isolate mx-auto min-h-[70vh] w-full max-w-5xl overflow-hidden px-4 pb-10 pt-8 sm:px-9 sm:pt-14">
        <div className="callboard-light" aria-hidden />
      </div>
    </div>
  );
}
