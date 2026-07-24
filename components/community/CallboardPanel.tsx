"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCommunityFeed, type FeedEvent } from "@/hooks/useCommunityFeed";
import { EventLine, relativeTime } from "./eventRender";

/**
 * The Callboard — the backstage notice board, rendered as an actual corkboard:
 * events are cream paper slips pinned up at slight angles. Ambient, mounted on
 * the landing surface. NOT the Green Room (the collaborate-and-rehearse space).
 */

// A warm cork surface (speckled) — deterministic so SSR and client agree.
const CORK_STYLE: React.CSSProperties = {
  backgroundColor: "#c49a68",
  backgroundImage:
    "radial-gradient(rgba(94,62,30,0.28) 1px, transparent 1.6px), radial-gradient(rgba(120,86,48,0.20) 1px, transparent 1.6px)",
  backgroundSize: "7px 7px, 11px 11px",
  backgroundPosition: "0 0, 3px 4px",
};

// Pushpin colors + tack angles cycle by index for a hand-pinned, organic feel.
const PIN_COLORS = ["#CB4B00", "#B91C1C", "#0D9488", "#CA8A04", "#7C3AED"];
const ROTATIONS = [-2, 1.5, -1, 2.2, -1.6, 1, -2.4];

// Force dark ink on the cream paper regardless of app theme, so the reused
// EventLine (which uses --foreground / --muted-foreground) stays readable.
const PAPER_INK: React.CSSProperties = {
  ["--foreground" as string]: "oklch(0.28 0.03 55)",
  ["--muted-foreground" as string]: "oklch(0.48 0.02 55)",
};

export function CallboardPanel({ rows = 5 }: { rows?: number }) {
  const { data } = useCommunityFeed(rows * 4);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const events = (data?.events ?? []).slice(0, rows);

  // Flash the board when a genuinely new note lands on top.
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
  if (events.length === 0) return null;

  return (
    <section
      className="relative overflow-hidden rounded-md border-[5px] border-[#6f5030] shadow-xl shadow-black/25"
      style={CORK_STYLE}
    >
      {/* inner vignette to give the cork depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 40px rgba(60,38,14,0.35)" }}
      />
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#CB4B00]/25 to-transparent"
          />
        )}
      </AnimatePresence>

      {/* masthead plaque */}
      <div className="relative flex items-center justify-between px-4 pt-4">
        <span className="inline-flex items-center gap-2 rounded-sm bg-[#5b4126] px-2.5 py-1 shadow-md">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f0b070] opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#f0b070]" />
          </span>
          <span className="font-typewriter text-[11px] font-bold uppercase tracking-[0.25em] text-[#f3e7d2]">
            Callboard
          </span>
        </span>
        <span className="font-typewriter text-[11px] text-[#3f2c15]/80">
          {data.actor_count} {data.actor_count === 1 ? "actor" : "actors"}{" "}
          {data.window === "today" ? "today" : "this week"}
        </span>
      </div>

      {/* pinned notes */}
      <div className="relative px-4 pb-4 pt-5">
        <motion.ul
          initial="show"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          className="space-y-3.5"
        >
          <AnimatePresence initial={false}>
            {events.map((e, i) => (
              <PinnedNote key={e.id} e={e} index={i} />
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>

      {/* footer: a little tab pinned to the bottom of the board */}
      <div className="relative px-4 pb-4">
        <Link
          href="/callboard"
          className="block bg-[#fbf6ea] py-2 text-center font-typewriter text-[11px] font-medium text-[#6f5030] shadow-md transition-colors hover:text-[#CB4B00]"
        >
          see the whole board →
        </Link>
      </div>
    </section>
  );
}

function PinnedNote({ e, index }: { e: FeedEvent; index: number }) {
  const rot = ROTATIONS[index % ROTATIONS.length];
  const pin = PIN_COLORS[index % PIN_COLORS.length];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10, rotate: rot }}
      animate={{ opacity: 1, y: 0, rotate: rot }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative"
    >
      {/* pushpin */}
      <span
        className="absolute -top-2 left-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full shadow-[0_2px_3px_rgba(0,0,0,0.4)]"
        style={{
          background: `radial-gradient(circle at 35% 30%, #ffffffcc, ${pin} 55%, ${pin})`,
        }}
      />
      <div
        className="bg-[#fbf6ea] px-3 py-2.5 shadow-[0_3px_6px_rgba(40,25,8,0.35)]"
        style={PAPER_INK}
      >
        <p className="text-[13px] leading-snug text-foreground">
          <span className="font-semibold">{e.name}</span> <EventLine e={e} />
        </p>
        <p className="mt-1 font-typewriter text-[10px] uppercase tracking-wider text-muted-foreground">
          {relativeTime(e.created_at)}
        </p>
      </div>
    </motion.li>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <section
      className="rounded-md border-[5px] border-[#6f5030] p-4 shadow-xl shadow-black/25"
      style={CORK_STYLE}
    >
      <div className="mb-5 h-6 w-24 rounded-sm bg-[#5b4126]/70" />
      <div className="space-y-3.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 bg-[#fbf6ea]/70 shadow-md" />
        ))}
      </div>
    </section>
  );
}
