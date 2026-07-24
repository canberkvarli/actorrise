"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCommunityFeed,
  useShareActivity,
  type FeedEvent,
} from "@/hooks/useCommunityFeed";
import { Avatar, EventLine, chipFor, relativeTime } from "./eventRender";

/* The full Callboard view (its own page, reached via "see everything" — NOT a
   nav tab). The ambient version is CallboardPanel on the landing surface. */

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

function VisibilityToggle() {
  const { shareActivity, isLoading, setShareActivity } = useShareActivity();
  if (isLoading || shareActivity === undefined) return null;
  return (
    <button
      type="button"
      onClick={() => setShareActivity(!shareActivity)}
      className="text-xs text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
    >
      {shareActivity
        ? "You're visible in here · Hide my activity"
        : "You're hidden · Show my activity"}
    </button>
  );
}

function CounterPill({ count, window }: { count: number; window: "today" | "week" }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/60 px-3.5 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <span className="text-sm text-foreground">
        <span className="font-semibold">{count}</span>{" "}
        {count === 1 ? "actor" : "actors"} in the building{" "}
        {window === "today" ? "today" : "this week"}
      </span>
    </div>
  );
}

export function CallboardFeed() {
  const { data, isLoading } = useCommunityFeed();
  const events = data?.events ?? [];

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
          The Callboard
        </h1>
        {mounted && data && <CounterPill count={data.actor_count} window={data.window} />}
        {mounted && <VisibilityToggle />}
      </header>

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
      <p className="mt-1 text-sm text-muted-foreground">Be the first to make some noise.</p>
      <Link
        href="/monologues"
        className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#B03000]"
      >
        Find a monologue
      </Link>
    </div>
  );
}
