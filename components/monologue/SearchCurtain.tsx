"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { ClapperSketch, SpotlightSketch } from "@/components/brand/sketches";

/**
 * The wait, staged.
 *
 * This replaced a six-row checklist with green ticks that filled in on a timer:
 * "Consulting the drama gods ✓", "Asking Shakespeare which one hits hardest ✓".
 * Two problems with that. It was fake progress — the ticks were on `setTimeout`,
 * not on anything the backend reported, so a slow search sat there "finished"
 * while nothing had arrived. And a ticked checklist is the visual language of a
 * build log, not a theatre.
 *
 * Searching is a follow spot hunting the stage for someone worth lighting: the
 * lamp is on, the beam is moving, it hasn't found anyone yet. Film and TV get a
 * clapperboard instead, so the two halves of the library finally look different
 * from each other while you wait.
 *
 * Not the ghost light — that one belongs to the empty state, where the search
 * came back with nothing and the theatre really is dark. Using it here made
 * "still looking" and "found nothing" the same picture.
 */

type SearchMode = "plays" | "film_tv";

/** Lower case and parenthesised on purpose — these are invented asides, which
 *  is what `.stage-direction` (which force-lowercases) is actually for. */
const BEATS: Record<SearchMode, string[]> = {
  plays: [
    "(the house goes quiet.)",
    "(reading twelve thousand pages.)",
    "(listening for the one that lands.)",
    "(marking the speeches worth your time.)",
    "(almost.)",
  ],
  film_tv: [
    "(the house goes quiet.)",
    "(rolling through the reels.)",
    "(listening for the one that lands.)",
    "(marking the scenes worth your time.)",
    "(almost.)",
  ],
};

const BEAT_MS = 2400;

export function SearchCurtain({ mode = "plays" }: { mode?: SearchMode }) {
  const beats = BEATS[mode];
  const Sketch = mode === "film_tv" ? ClapperSketch : SpotlightSketch;
  const [beat, setBeat] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    setBeat(0);
    const id = setInterval(
      // Hold on the last beat instead of looping. Cycling back to "the house
      // goes quiet" would read as the search having started over.
      () => setBeat((prev) => (prev < beats.length - 1 ? prev + 1 : prev)),
      BEAT_MS,
    );
    return () => clearInterval(id);
  }, [beats]);

  return (
    // Centred in the space the results will fill, so the bulb sits where the
    // first card is about to appear rather than floating above a void.
    <div
      className="flex min-h-[46vh] flex-col items-center justify-center px-4 py-12"
      role="status"
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        {/* The lamp's glow, breathing. */}
        {!reduced && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-primary/25 blur-2xl"
            animate={{ scale: [1, 1.18, 1], opacity: [0.3, 0.65, 0.3] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <Sketch size={88} className="relative text-foreground/70" />
      </div>

      {/* Fixed height so the beam below doesn't jump as lines change length. */}
      <div className="mt-6 flex h-6 items-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={beat}
            aria-hidden
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="stage-direction text-sm text-muted-foreground sm:text-base"
          >
            {beats[beat]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* A follow spot travelling the boards. */}
      <div className="relative mt-7 h-px w-56 overflow-hidden bg-border/60">
        {!reduced && (
          <motion.span
            aria-hidden
            className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-primary to-transparent"
            animate={{ x: ["-5rem", "14rem"] }}
            transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>

      {/* One steady announcement, rather than five as the beats change. */}
      <span className="sr-only">Searching for monologues…</span>
    </div>
  );
}

export default SearchCurtain;
