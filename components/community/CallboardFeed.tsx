"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  useCommunityFeed,
  useShareActivity,
  type FeedEvent,
} from "@/hooks/useCommunityFeed";
import { useTrending } from "@/hooks/useTrending";
import { Avatar, EventLine, chipFor, relativeTime } from "./eventRender";

/**
 * The Callboard — the board itself, not a feed wearing its name.
 *
 * Backstage a callboard is a physical object: cork, tacks, notices pinned at
 * angles by the stage manager, a sign-in sheet down one side. This renders that
 * object. Everything pinned to it is a door — a notice you can act on — because
 * a real callboard exists to be obeyed, not admired.
 *
 * Two things this deliberately drops from the old version:
 *
 *  1. The four-up stat grid. One of its cells was "rehearsals", and `rehearsed`
 *     has fired twice in the product's entire history (zero in the last week),
 *     so the page shipped a permanent, prominent 0. The masthead's stamped line
 *     carries only counts that are actually populated.
 *
 *  2. Hover-to-reveal action chips. They were the only link on a feed row, and
 *     hover does not exist on a phone, so on mobile every row in the live feed
 *     linked precisely nowhere. Actions are always visible now.
 */

/* Deterministic tilt from the notice's own identity. Math.random() here would
   reshuffle every card on every 25s refetch, which is the exact thing that
   makes fake-scatter look cheap. */
function tilt(seed: string, spread = 2): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `${(((Math.abs(h) % 200) / 100 - 1) * spread).toFixed(2)}deg`;
}

const STAMP_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function CallboardFeed() {
  const { data } = useCommunityFeed(100);
  const { data: trending } = useTrending(7);
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const events = useMemo(() => data?.events ?? [], [data]);
  const joined = useMemo(() => events.filter((e) => e.event_type === "joined"), [events]);
  const searched = useMemo(() => events.filter((e) => e.event_type === "searched"), [events]);

  /* Arrivals live on the sign-in sheet, so they come out of the running feed —
     otherwise the same person appears twice on one board, and every third row
     of "as it happens" is someone who has not done anything yet.

     Then one row per actor. Searching fires an event per refinement, so a
     single person tuning their filters produced five near-identical rows in a
     row ("Sam is looking for a comedic monologue for a woman", "Sam is looking
     for a monologue for a woman in her 18-25"...). Keeping only each actor's
     latest turns that back into a board of people rather than a log. */
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

  if (!mounted || !data) return <BoardSkeleton />;

  const headline = trending?.[0];
  const alsoBilled = (trending ?? []).slice(1, 6);
  const windowLabel = data.window === "today" ? "today" : "this week";

  return (
    <div className="px-3 pb-24 pt-5 sm:px-6 sm:pt-10">
      <div className="callboard callboard-frame stage-grain relative mx-auto w-full max-w-5xl overflow-hidden px-4 pb-10 pt-8 sm:px-8 sm:pb-14 sm:pt-12">
        {/* ── The masthead, screenprinted onto the board itself ─────────── */}
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 sm:mb-12"
        >
          <p className="font-typewriter text-[11px] italic tracking-wide text-[var(--board-muted)] sm:text-xs">
            (the house, before curtain.)
          </p>
          <h1 className="font-playbill mt-2 text-[clamp(2.75rem,13vw,7rem)] text-[var(--board-ink)]">
            The Callboard
          </h1>
          <div className="mt-4 h-px w-full bg-[var(--board-rule)]" />
          <p className="mt-2.5 font-typewriter text-[10px] uppercase tracking-[0.22em] text-[var(--board-muted)] sm:text-xs">
            {STAMP_DATE.format(new Date())}
            {" · "}
            {data.actor_count} in the house {windowLabel}
            {searched.length > 0 && <> · {searched.length} searches</>}
            {joined.length > 0 && <> · {joined.length} new faces</>}
          </p>
        </motion.header>

        {/* ── The notices ───────────────────────────────────────────────────
            CSS columns, not a grid. On a grid every card in a row inherits the
            tallest card's height, so a 5-line "Also billed" stood as a metre of
            blank paper beside a 14-row feed. Notices pack against each other
            here and each keeps its own height, which is how a board actually
            fills up. Top billing sits outside the columns so it can run full
            width. */}
        {/* Not full width. A sheet spanning the whole board with its text in the
            left third reads as a layout that failed; a poster pinned slightly
            off-centre reads as a poster. */}
        {headline && (
          <div className="mb-5 sm:mb-7 sm:w-[72%]">
            <Notice
              seed={`top-${headline.id}`}
              index={0}
              label="Top billing"
              reduceMotion={reduceMotion}
            >
              <Link href={`/monologue/${headline.id}`} className="group block">
                <p className="font-playbill text-[clamp(1.9rem,7vw,3.25rem)] text-[var(--board-ink)] transition-colors group-hover:text-primary">
                  {headline.character_name}
                </p>
                <p className="mt-1.5 font-typewriter text-sm text-[var(--board-muted)]">
                  {headline.play_title}
                  {headline.author ? ` · ${headline.author}` : ""}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 border-b border-primary/50 pb-0.5 text-sm font-semibold text-primary">
                  Read it
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </Link>
            </Notice>
          </div>
        )}

        {/* Two columns I arrange by hand, not a balancer. CSS columns dropped
            two notices into a void here: Chrome cannot break a
            `break-inside-avoid` card, so a tall feed threw the balance and left
            a metre of blank board with cards stranded below it. A grid instead
            makes every card inherit the tallest one's height. Explicit columns
            do neither, and they let the board be *composed* — the standing
            notices on the left, the moving ones on the right. */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
          <div className="flex flex-1 flex-col gap-5 sm:gap-7">
            {searchTags.length > 0 && (
            <Notice
              seed="hunting"
              index={1}
              label="The house is hunting for"
              reduceMotion={reduceMotion}
            >
              {/* Each tag runs that search rather than dumping you on an empty
                  /monologues. The old version rendered these as inert spans. */}
              <div className="flex flex-wrap gap-x-2 gap-y-2.5">
                {searchTags.map(([tag, count]) => (
                  <Link
                    key={tag}
                    href={`/monologues?q=${encodeURIComponent(tag)}`}
                    className="border border-[var(--board-rule)] px-2.5 py-1 font-typewriter text-sm capitalize text-[var(--board-muted)] transition-colors hover:border-primary/50 hover:text-primary"
                    style={count > 2 ? { fontWeight: 600 } : undefined}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </Notice>
          )}

          {(named.length > 0 || anonCount > 0) && (
            <Notice seed="signin" index={2} label="Sign-in sheet" reduceMotion={reduceMotion}>
              <ul>
                {named.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 border-b border-dashed border-[var(--board-rule)] py-2 last:border-b-0"
                  >
                    <Avatar e={e} size={30} />
                    <span className="min-w-0 flex-1 truncate font-typewriter text-sm text-[var(--board-ink)]">
                      {e.name}
                    </span>
                    {e.city && (
                      <span className="hidden shrink-0 font-typewriter text-xs text-[var(--board-muted)] min-[420px]:inline">
                        {e.city}
                      </span>
                    )}
                    <span className="shrink-0 font-typewriter text-[11px] text-[var(--board-muted)]">
                      {relativeTime(e.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
              {anonCount > 0 && (
                <p className="mt-2.5 font-typewriter text-xs text-[var(--board-muted)]">
                  + {anonCount} who haven&rsquo;t signed their name yet
                </p>
              )}
            </Notice>
          )}
          </div>

          <div className="flex flex-1 flex-col gap-5 sm:gap-7">
          {doings.length > 0 && (
            <Notice
              seed="asithappens"
              index={3}
              label="As it happens"
              reduceMotion={reduceMotion}
            >
              <ul>
                {doings.map((e) => {
                  const chip = chipFor(e);
                  return (
                    <li
                      key={e.id}
                      className="border-b border-dashed border-[var(--board-rule)] py-2.5 last:border-b-0"
                    >
                      <p className="text-sm text-[var(--board-muted)]">
                        <span className="font-medium text-[var(--board-ink)]">{e.name}</span>{" "}
                        <EventLine e={e} />
                      </p>
                      <p className="mt-1 flex items-center gap-2.5">
                        <span className="font-typewriter text-[11px] text-[var(--board-muted)]">
                          {relativeTime(e.created_at)}
                        </span>
                        {chip && (
                          <Link
                            href={chip.href}
                            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            {chip.label} →
                          </Link>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Notice>
          )}

          {alsoBilled.length > 0 && (
            <Notice seed="also" index={4} label="Also billed" reduceMotion={reduceMotion}>
              <ul>
                {alsoBilled.map((m) => (
                  <li key={m.id} className="border-b border-dashed border-[var(--board-rule)] last:border-b-0">
                    <Link
                      href={`/monologue/${m.id}`}
                      className="group flex items-baseline gap-2 py-2.5"
                    >
                      <span className="font-playbill text-lg text-[var(--board-ink)] transition-colors group-hover:text-primary">
                        {m.character_name}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-typewriter text-xs text-[var(--board-muted)]">
                        {m.play_title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          </div>
        </div>

        <VisibilityStamp />
      </div>
    </div>
  );
}

/** A sheet of paper, tacked to the board. */
function Notice({
  seed,
  index,
  label,
  className,
  reduceMotion,
  children,
}: {
  seed: string;
  index: number;
  label: string;
  className?: string;
  reduceMotion: boolean | null;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      /* The wrapper owns the entrance (drop + settle, as if pinned up one at a
         time); the inner .callboard-notice owns the resting tilt in CSS. Two
         elements because both want `transform`. */
      initial={reduceMotion ? false : { opacity: 0, y: -22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 18,
        delay: reduceMotion ? 0 : 0.12 + index * 0.09,
      }}
      className={className}
    >
      <div
        className="callboard-notice relative px-4 pb-4 pt-7 sm:px-5 sm:pb-5 sm:pt-8"
        style={{ "--tilt": tilt(seed) } as React.CSSProperties}
      >
        <Tack />
        <h2 className="mb-3 font-typewriter text-[10px] uppercase tracking-[0.2em] text-[var(--board-muted)]">
          {label}
        </h2>
        {children}
      </div>
    </motion.div>
  );
}

/** Brass pin. Highlight up and left, shadow down and right. */
function Tack() {
  return (
    <span
      aria-hidden
      className="absolute left-1/2 top-2.5 h-3 w-3 -translate-x-1/2 rounded-full"
      style={{
        background:
          "radial-gradient(circle at 32% 28%, oklch(0.92 0.09 85), oklch(0.68 0.15 62) 55%, oklch(0.45 0.11 55))",
        boxShadow: "0 2px 3px color-mix(in oklab, black 45%, transparent)",
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
    <div className="mt-10 border-t border-[var(--board-rule)] pt-4 sm:mt-14">
      <button
        type="button"
        onClick={() => setShareActivity(!shareActivity)}
        className="font-typewriter text-[11px] uppercase tracking-[0.18em] text-[var(--board-muted)] underline-offset-4 transition-colors hover:text-[var(--board-ink)] hover:underline"
      >
        {shareActivity
          ? "You are on this board · take me off"
          : "You are off this board · put me back"}
      </button>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="px-3 pb-24 pt-5 sm:px-6 sm:pt-10">
      <div className="callboard callboard-frame mx-auto w-full max-w-5xl px-4 pb-10 pt-8 sm:px-8 sm:pt-12">
        <div className="h-4 w-40 animate-pulse bg-[var(--board-rule)]" />
        <div className="mt-3 h-[clamp(2.75rem,13vw,7rem)] w-full max-w-2xl animate-pulse bg-[var(--board-rule)]" />
        <div className="mt-4 h-px w-full bg-[var(--board-rule)]" />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-7">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`callboard-notice h-40 animate-pulse ${i === 0 ? "sm:col-span-2" : ""}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
