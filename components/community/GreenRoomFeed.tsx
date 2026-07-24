"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useCommunityFeed, type FeedEvent } from "@/hooks/useCommunityFeed";

/* ----------------------------- copy helpers ------------------------------ */

function genderNoun(g?: string): string | null {
  const s = (g || "").toLowerCase();
  if (s.startsWith("f") || s === "woman") return "woman";
  if (s.startsWith("m") || s === "man") return "man";
  return null;
}

function pronoun(g?: string): string {
  const n = genderNoun(g);
  return n === "woman" ? "her" : n === "man" ? "his" : "their";
}

function agePhrase(age?: string): string | null {
  if (!age) return null;
  return age; // e.g. "30s", "teens", "60+"
}

// A typewriter span for any piece/play title — matches the app's rule that
// monologue *text/titles* render in the typewriter face.
function Title({ children }: { children: React.ReactNode }) {
  return <span className="font-typewriter text-foreground/90">{children}</span>;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** The event sentence, with titles styled in typewriter. */
function EventLine({ e }: { e: FeedEvent }) {
  const p = e.payload;
  switch (e.event_type) {
    case "joined":
      return (
        <>joined ActorRise{e.city ? <> from {e.city}</> : null}</>
      );
    case "searched": {
      const g = genderNoun(p.gender);
      const age = agePhrase(p.age_range);
      const piece = p.tone ? `a ${p.tone} monologue` : "a monologue";
      let who: React.ReactNode = null;
      if (g) {
        who = <> for a {g}{age ? ` in ${pronoun(p.gender)} ${age}` : ""}</>;
      } else if (age) {
        who = <> for someone in their {age}</>;
      }
      return <>is looking for {piece}{who}</>;
    }
    case "viewed":
      return p.title ? <>is reading <Title>{p.title}</Title></> : <>is reading a monologue</>;
    case "bookmarked":
      return p.title ? <>saved <Title>{p.title}</Title></> : <>saved a monologue</>;
    case "worked":
      return <>ran a monologue out loud</>;
    case "rehearsed":
      return (
        <>rehearsed a scene{p.line_count ? <> · {p.line_count} lines</> : null}</>
      );
    case "milestone":
      return <>hit {p.milestone_n} rehearsals</>;
    case "went_plus":
      return <>went Plus</>;
    case "trending":
      return (
        <>
          <Title>{p.title}</Title> is trending
          {p.reader_count ? <> · {p.reader_count} actors reading it</> : null}
        </>
      );
    default:
      return null;
  }
}

/** Where the card's action chip walks the actor — into the paywall funnel. */
function chipFor(e: FeedEvent): { label: string; href: string } | null {
  const id = e.payload.monologue_id;
  switch (e.event_type) {
    case "viewed":
    case "bookmarked":
    case "trending":
      return { label: "Read this", href: id ? `/monologue/${id}` : "/monologues" };
    case "searched":
      return { label: "Find yours", href: "/monologues" };
    case "worked":
    case "rehearsed":
      return { label: "Rehearse", href: "/rehearse" };
    default:
      return null; // joined / went_plus / milestone are social proof, not actions
  }
}

/* ------------------------------- avatar ---------------------------------- */

function Avatar({ e }: { e: FeedEvent }) {
  const [failed, setFailed] = useState(false);
  const initial = (e.name?.[0] || "?").toUpperCase();
  const showImg = e.headshot_url && !failed;
  return (
    <div className="relative shrink-0">
      <div className="absolute inset-0 rounded-full bg-[var(--stage-glow,oklch(0.72_0.17_55))] opacity-20 blur-md" />
      {showImg ? (
        <Image
          src={e.headshot_url as string}
          alt=""
          width={44}
          height={44}
          unoptimized
          onError={() => setFailed(true)}
          className="relative h-11 w-11 rounded-full object-cover ring-1 ring-primary/30"
        />
      ) : (
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-[#B03000] text-background text-sm font-semibold ring-1 ring-primary/30">
          {initial}
        </span>
      )}
    </div>
  );
}

/* ------------------------------- card ------------------------------------ */

function EventCard({ e }: { e: FeedEvent }) {
  const chip = chipFor(e);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
      className="group flex items-center gap-4 border-b border-border/40 py-4"
    >
      <Avatar e={e} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">{e.name}</span>{" "}
          <EventLine e={e} />
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/60">{relativeTime(e.created_at)}</p>
      </div>
      {chip && (
        <Link
          href={chip.href}
          className="shrink-0 rounded-full border border-primary/40 px-3.5 py-1.5 text-xs font-medium text-primary opacity-0 shadow-[0_0_14px_-4px_var(--primary)] transition-all hover:bg-primary/10 group-hover:opacity-100 max-md:opacity-100"
        >
          {chip.label}
        </Link>
      )}
    </motion.div>
  );
}

/* ------------------------------- header ---------------------------------- */

function CounterPill({ count, window }: { count: number; window: "today" | "week" }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/60 px-3.5 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <span className="text-sm text-foreground">
        <span className="font-semibold">{count}</span>{" "}
        {count === 1 ? "actor" : "actors"} in the building {window === "today" ? "today" : "this week"}
      </span>
    </div>
  );
}

/* ------------------------------- feed ------------------------------------ */

export function GreenRoomFeed() {
  const { data, isLoading } = useCommunityFeed();
  const events = data?.events ?? [];

  // Gate first paint so the server render (React Query cache empty) and the
  // first client render (cache may be warm) agree — otherwise the CounterPill
  // and relative timestamps trip a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Flash a soft light when a genuinely new event arrives at the top.
  const topId = events[0]?.id;
  const prevTop = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (topId !== undefined && prevTop.current !== undefined && topId > prevTop.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
    prevTop.current = topId;
  }, [topId]);

  const container = useMemo(
    () => ({ show: { transition: { staggerChildren: 0.06 } } }),
    []
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8 sm:pt-12">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8">
        <h1 className="font-brand text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          The Green Room
        </h1>
        {mounted && data && <CounterPill count={data.actor_count} window={data.window} />}
      </header>

      {/* live-arrival light */}
      <div className="relative">
        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="pointer-events-none absolute -top-3 left-0 right-0 h-8 bg-gradient-to-b from-primary/25 to-transparent blur-md"
            />
          )}
        </AnimatePresence>

        {!mounted || isLoading ? (
          <FeedSkeleton />
        ) : events.length === 0 ? (
          <EmptyState />
        ) : (
          <motion.div variants={container} initial="show" animate="show" layout>
            <AnimatePresence initial={false}>
              {events.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-4">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-16 animate-pulse rounded bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-20 text-center">
      <p className="text-lg text-foreground">The house is quiet right now.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Be the first to make some noise.
      </p>
      <Link
        href="/monologues"
        className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#B03000]"
      >
        Find a monologue
      </Link>
    </div>
  );
}
