"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  ClapperSketch,
  CrownSketch,
  DaggerSketch,
  MasksSketch,
  ReelSketch,
  RoseSketch,
  SkullSketch,
  SpotlightSketch,
} from "@/components/brand/sketches";

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

type SearchMode = "plays" | "film_tv" | "for_you";

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
  /* Find for me is not a search — nobody typed anything. These beats describe
     what it is actually doing with the profile, so the wait explains the
     feature instead of filling time. */
  for_you: [
    "(reading your profile.)",
    "(putting the overdone ones back.)",
    "(looking for what you haven't been sent.)",
    "(casting you against type, once.)",
    "(almost.)",
  ],
};

const BEAT_MS = 2400;
/** Deliberately not a multiple of BEAT_MS — see the sketch clock below. */
const SKETCH_MS = 3600;

/**
 * The drawing changes with the beat, and where in the pool it starts changes
 * with the search.
 *
 * It used to pick one and hold it for the whole wait, on the theory that
 * swapping the image would turn a calm screen into a slideshow. In practice a
 * search runs long enough that one line drawing has nothing left to give by the
 * second beat, and each one draws itself in — so a change is a small event
 * rather than a flicker. One drawing per beat, cross-faded.
 *
 * Objects, not scenery. The first pass at this pool reached for stage furniture
 * — footlights, a stage door, a jester — and none of it survived being the only
 * thing on screen at 88px. They were drawn as small accents beside landing-page
 * copy, which tells you what you are looking at; alone they are ambiguous
 * shapes. The jester read as a rabbit, the stage door as an unfinished
 * rectangle, and the footlights as three V's over three bumps.
 *
 * What holds at that size is a thing you can name in one word. These are the
 * playbill sketches, so leafing through them while a search runs reads as
 * flipping past plays rather than watching a spinner.
 *
 * Still excludes the sketches that mean something specific elsewhere in search
 * (ghost light = nothing found, ticket = empty bill, script pages = nothing to
 * show), so a drawing never means two things on the same page.
 *
 * Everything here must be square and take `size`. CurtainSketch is neither — it
 * takes width/height and defaults to 220x44 — and this array's type erases the
 * real signatures, so putting it in compiled cleanly and rendered a swag of
 * curtain twice the width of the slot.
 */
const CURTAIN_SKETCHES: Record<SearchMode, typeof SpotlightSketch[]> = {
  plays: [SpotlightSketch, MasksSketch, SkullSketch, CrownSketch, DaggerSketch, RoseSketch],
  /* Three, not four: the marquee went the way of the footlights. Its canopy
     over a row of bulbs reads as a table on castors once you take the building
     away from it, and three drawings that land beat four with a dud in the
     rotation. */
  film_tv: [ClapperSketch, ReelSketch, SpotlightSketch],
  for_you: [SpotlightSketch, MasksSketch, CrownSketch, DaggerSketch, RoseSketch, SkullSketch],
};

export function SearchCurtain({
  mode = "plays",
  name,
  facts,
}: {
  mode?: SearchMode;
  /** First name, shown in proper case. Only used by `for_you`. */
  name?: string | null;
  /** The profile fields the recommendation is actually keyed on. */
  facts?: string[];
}) {
  const beats = BEATS[mode];
  const [beat, setBeat] = useState(0);
  const reduced = useReducedMotion();

  // Lazy initialiser, so the choice is made once on mount rather than on every
  // render. This component only ever mounts client-side (it needs a search in
  // flight), so there is no server render for the random pick to disagree with.
  const pool = CURTAIN_SKETCHES[mode];
  const [pick] = useState(() => Math.floor(Math.random() * pool.length));
  const [frame, setFrame] = useState(0);
  const sketchIndex = (pick + frame) % pool.length;
  const Sketch = pool[sketchIndex];

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

  /* Its own clock, and it never stops.
     Tying the drawing to the beat looked right until a search ran past the last
     line: the beats hold on "(almost.)" rather than looping, so the picture
     froze with them — which on the slow searches, the only ones long enough to
     be worth watching, is exactly when it needs to still be alive. The odd
     interval also keeps it off the beat, so the text and the drawing never
     change in the same instant. */
  useEffect(() => {
    setFrame(0);
    const id = setInterval(() => setFrame((f) => f + 1), SKETCH_MS);
    return () => clearInterval(id);
  }, [mode]);

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
        {/* Keyed on which drawing it is, so each one mounts fresh and draws
            itself in rather than morphing paths into the next shape. */}
        <AnimatePresence mode="wait">
          <motion.span
            key={sketchIndex}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <Sketch size={88} className="text-foreground/70" />
          </motion.span>
        </AnimatePresence>
      </div>

      {/* The personal line. Deliberately NOT .stage-direction: that class
          force-lowercases, and it would render a person's name as "canberk".
          The beats below stay lowercase because they are invented asides; a
          name is not. */}
      {mode === "for_you" && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-7 text-center font-brand text-2xl font-medium text-foreground sm:text-3xl"
        >
          {name ? <>Casting you, {name}.</> : <>Casting you.</>}
        </motion.p>
      )}

      {/* What it is keyed on, so the wait shows its working rather than
          asking you to trust it. Staggered in, one fact at a time. */}
      {mode === "for_you" && facts && facts.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {facts.map((f, i) => (
            <motion.span
              key={f}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-2 font-typewriter text-xs capitalize text-muted-foreground"
            >
              {i > 0 && <span aria-hidden className="text-muted-foreground/40">·</span>}
              {f}
            </motion.span>
          ))}
        </div>
      )}

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
      <span className="sr-only">
        {mode === "for_you"
          ? "Finding monologues that suit your profile…"
          : "Searching for monologues…"}
      </span>
    </div>
  );
}

export default SearchCurtain;
