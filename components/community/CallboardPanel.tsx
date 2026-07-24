"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCommunityFeed } from "@/hooks/useCommunityFeed";
import { Avatar, EventLine, chipFor, relativeTime } from "./eventRender";

/**
 * The Callboard — an ambient strip of live platform activity, mounted on the
 * landing surface so actors passively see the buzz. Compact by design (a few
 * rows); the feed's own page is the deep view. This is NOT the Green Room
 * (which is reserved for the collaborate-and-rehearse space).
 */
export function CallboardPanel({ rows = 5 }: { rows?: number }) {
  const { data } = useCommunityFeed(rows * 4);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const events = (data?.events ?? []).slice(0, rows);

  // Flash the header light when a genuinely new event lands on top.
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

  if (!mounted || !data) return <PanelSkeleton rows={rows} />;
  if (events.length === 0) return null; // nothing happening → don't render an empty box

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm">
      {/* top glow line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-primary/20 to-transparent"
          />
        )}
      </AnimatePresence>

      {/* header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="font-typewriter text-xs uppercase tracking-[0.2em] text-muted-foreground">
            On the callboard
          </span>
        </div>
        <span className="text-xs text-muted-foreground/70">
          {data.actor_count} {data.actor_count === 1 ? "actor" : "actors"}{" "}
          {data.window === "today" ? "today" : "this week"}
        </span>
      </div>

      {/* rows */}
      <div className="px-3 pb-2 pt-1">
        <motion.ul
          initial="show"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        >
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const chip = chipFor(e);
              return (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/[0.03]"
                >
                  <Avatar e={e} size={32} />
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{e.name}</span>{" "}
                    <EventLine e={e} />
                  </p>
                  <span className="shrink-0 text-[11px] text-muted-foreground/50">
                    {relativeTime(e.created_at)}
                  </span>
                  {chip && (
                    <Link
                      href={chip.href}
                      className="hidden shrink-0 rounded-full border border-primary/40 px-3 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 group-hover:inline-block"
                    >
                      {chip.label}
                    </Link>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      </div>

      {/* footer */}
      <Link
        href="/callboard"
        className="block border-t border-border/40 px-5 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
      >
        See everything happening →
      </Link>
    </section>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <section className="rounded-2xl border border-border/50 bg-card/40">
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-20 animate-pulse rounded bg-muted/70" />
      </div>
      <div className="space-y-1 px-3 pb-3 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </section>
  );
}
