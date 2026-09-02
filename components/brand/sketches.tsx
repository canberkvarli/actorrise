"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ComponentProps } from "react";

/**
 * The playbill sketches: hand-drawn line icons for famous plays and stage
 * archetypes. All strokes use currentColor so they sit on any surface —
 * landing accents today, empty states / cards / filters across the app later.
 * Each one draws itself in when scrolled into view (Apple-keynote style).
 */

type SketchProps = {
  size?: number;
  className?: string;
  /** seconds before the drawing starts once in view */
  delay?: number;
  title?: string;
};

function useSketchAnimation(delay: number) {
  const reduce = useReducedMotion();
  return (order: number): Partial<ComponentProps<typeof motion.path>> =>
    reduce
      ? {}
      : {
          initial: { pathLength: 0, opacity: 0 },
          whileInView: { pathLength: 1, opacity: 1 },
          viewport: { once: true, amount: 0.6 },
          transition: {
            pathLength: { duration: 0.9, ease: "easeInOut", delay: delay + order * 0.18 },
            opacity: { duration: 0.01, delay: delay + order * 0.18 },
          },
        };
}

/**
 * For strokes that carry their own `strokeDasharray` (a beam of light, a
 * perforation).
 *
 * These can't be a `motion.path` at all: framer-motion's SVG builder writes
 * strokeDasharray itself to implement `pathLength`, and it stamps "1px 1px"
 * over any dash pattern you set — verified in the browser, the dashes came out
 * solid. So the animation goes on a wrapping `motion.g` and the path inside
 * stays plain, keeping its own dashes.
 */
function useSketchFade(delay: number) {
  const reduce = useReducedMotion();
  return (order: number): Partial<ComponentProps<typeof motion.g>> =>
    reduce
      ? {}
      : {
          initial: { opacity: 0 },
          whileInView: { opacity: 1 },
          viewport: { once: true, amount: 0.6 },
          transition: { duration: 0.5, delay: delay + order * 0.18 },
        };
}

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Frame({
  size,
  className,
  title,
  viewBox,
  children,
}: SketchProps & { viewBox: string; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {children}
    </svg>
  );
}

/** Yorick — Hamlet. The one everybody brings. */
export function SkullSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M32 6 C17 6 10 17 10 28 C10 36 14 41 18 44 L18 52 C18 55 20 57 23 57 L41 57 C44 57 46 55 46 52 L46 44 C50 41 54 36 54 28 C54 17 47 6 32 6 Z"
      />
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M20 28 C20 24 23 22 26 22 C29 22 31 25 30 29 C29 32 26 33 24 33 C21 33 20 31 20 28 Z"
      />
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M44 28 C44 24 41 22 38 22 C35 22 33 25 34 29 C35 32 38 33 40 33 C43 33 44 31 44 28 Z"
      />
      <motion.path {...strokeProps} {...draw(2)} d="M32 36 L29 42 L35 42 Z" />
      <motion.path {...strokeProps} {...draw(3)} d="M26 50 L26 56 M32 50 L32 56 M38 50 L38 56" />
    </Frame>
  );
}

/** Comedy and tragedy — the trade itself. */
export function MasksSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M8 12 C16 10 24 10 32 12 L32 34 C32 44 26 50 20 50 C14 50 8 44 8 34 Z"
      />
      <motion.path {...strokeProps} {...draw(1)} d="M14 24 C15 22 17 22 18 24 M24 24 C25 22 27 22 28 24" />
      <motion.path {...strokeProps} {...draw(1)} d="M14 34 C17 39 23 39 26 34" />
      <motion.path
        {...strokeProps}
        {...draw(2)}
        d="M32 16 C40 14 48 14 56 16 L56 38 C56 48 50 54 44 54 C38 54 32 48 32 38 Z"
      />
      <motion.path {...strokeProps} {...draw(3)} d="M38 28 C39 26 41 26 42 28 M48 28 C49 26 51 26 52 28" />
      <motion.path {...strokeProps} {...draw(3)} d="M38 44 C41 39 47 39 50 44" />
    </Frame>
  );
}

/** Is this a dagger which I see before me — Macbeth. */
export function DaggerSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path {...strokeProps} {...draw(0)} d="M32 4 C36 12 36 26 32 38 C28 26 28 12 32 4 Z" />
      <motion.path {...strokeProps} {...draw(1)} d="M22 40 L42 40" />
      <motion.path {...strokeProps} {...draw(2)} d="M32 40 L32 52 M28 56 C30 53 34 53 36 56" />
      <motion.path {...strokeProps} {...draw(3)} d="M14 16 L18 20 M50 16 L46 20 M12 30 L17 31 M52 30 L47 31" />
    </Frame>
  );
}

/** A rose by any other name — Romeo & Juliet. */
export function RoseSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M32 22 C30 18 33 15 36 16 C40 17 40 22 36 25 C31 28 25 25 26 19 C27 12 36 9 42 14 C48 19 46 28 38 31 C29 34 20 28 22 18"
      />
      <motion.path {...strokeProps} {...draw(1)} d="M32 32 C32 40 32 48 32 58" />
      <motion.path {...strokeProps} {...draw(2)} d="M32 42 C27 40 23 41 20 38 C25 36 30 38 32 42 Z" />
      <motion.path {...strokeProps} {...draw(3)} d="M32 50 C37 48 41 49 44 46 C39 44 34 46 32 50 Z" />
    </Frame>
  );
}

/** Uneasy lies the head — Lear, the histories, every king. */
export function CrownSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M12 46 L9 22 L21 32 L32 16 L43 32 L55 22 L52 46 Z"
      />
      <motion.path {...strokeProps} {...draw(1)} d="M12 52 L52 52" />
      <motion.path {...strokeProps} {...draw(2)} d="M9 19 A1.8 1.8 0 1 1 9 15.4 A1.8 1.8 0 1 1 9 19 M32 13 A1.8 1.8 0 1 1 32 9.4 A1.8 1.8 0 1 1 32 13 M55 19 A1.8 1.8 0 1 1 55 15.4 A1.8 1.8 0 1 1 55 19" />
    </Frame>
  );
}

/** The Fool, Feste, the joker — the one who tells the truth. */
export function JesterSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M14 44 C12 30 18 20 32 20 C46 20 52 30 50 44 Z"
      />
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M16 28 C10 22 8 14 12 8 C18 10 22 16 22 23 M48 28 C54 22 56 14 52 8 C46 10 42 16 42 23 M32 20 C30 14 30 8 32 4"
      />
      <motion.path {...strokeProps} {...draw(2)} d="M11 10 A2 2 0 1 1 11 6 A2 2 0 1 1 11 10 M53 10 A2 2 0 1 1 53 6 A2 2 0 1 1 53 10 M32 6 A2 2 0 1 1 32 2 A2 2 0 1 1 32 6" />
      <motion.path {...strokeProps} {...draw(3)} d="M14 50 L50 50 M18 56 L46 56" />
    </Frame>
  );
}

/** The stage door, ajar, light spilling through. Walk in off book. */
export function StageDoorSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path {...strokeProps} {...draw(0)} d="M16 58 L16 8 L48 8 L48 58" />
      <motion.path {...strokeProps} {...draw(1)} d="M22 58 L22 14 L40 20 L40 58" />
      <motion.path {...strokeProps} {...draw(2)} d="M36 38 A1.6 1.6 0 1 1 36 34.8" />
      <motion.path {...strokeProps} {...draw(3)} d="M44 24 L54 20 M44 32 L56 30 M44 40 L54 42" />
    </Frame>
  );
}

/** A stage mic, waves coming off it — say the lines out loud. */
export function MicSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path {...strokeProps} {...draw(0)} d="M22 18 A10 10 0 1 1 42 18 A10 10 0 1 1 22 18" />
      <motion.path {...strokeProps} {...draw(1)} d="M25 13 L39 13 M23 18 L41 18 M25 23 L39 23" />
      <motion.path
        {...strokeProps}
        {...draw(2)}
        d="M22 22 C22 32 42 32 42 22 M32 32 L32 50 M22 56 C26 52 38 52 42 56"
      />
      <motion.path
        {...strokeProps}
        {...draw(3)}
        d="M12 10 C9 15 9 21 12 26 M52 10 C55 15 55 21 52 26"
      />
    </Frame>
  );
}

/** The ghost light — a bare bulb on a stand, left burning on the empty stage. */
export function GhostLightSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path {...strokeProps} {...draw(0)} d="M24 16 A8 8 0 1 1 40 16 A8 8 0 1 1 24 16" />
      <motion.path {...strokeProps} {...draw(1)} d="M29 18 L31 13 L33 18 L35 13" />
      <motion.path
        {...strokeProps}
        {...draw(2)}
        d="M28 23 L28 27 C28 28.5 36 28.5 36 27 L36 23 M32 28 L32 48"
      />
      <motion.path {...strokeProps} {...draw(3)} d="M32 48 L21 58 M32 48 L43 58 M32 48 L32 58" />
      <motion.path
        {...strokeProps}
        {...draw(4)}
        d="M13 16 L18 16 M51 16 L46 16 M18 4 L21.5 7.5 M46 4 L42.5 7.5"
      />
    </Frame>
  );
}

/** Curtain swag with tassels — the scene ends, another begins. */
export function CurtainSketch({
  width = 220,
  height = 44,
  className,
  delay = 0,
  title,
}: Omit<SketchProps, "size"> & { width?: number; height?: number }) {
  const draw = useSketchAnimation(delay);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 220 44"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <motion.path {...strokeProps} {...draw(0)} d="M2 4 L218 4" />
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M2 4 C30 22 50 22 74 12 C94 24 126 24 146 12 C170 22 190 22 218 4"
      />
      <motion.path {...strokeProps} {...draw(2)} d="M74 12 L74 26 M76 30 A2.4 2.4 0 1 1 71.4 30 A2.4 2.4 0 1 1 76 30 M146 12 L146 26 M148.3 30 A2.4 2.4 0 1 1 143.7 30 A2.4 2.4 0 1 1 148.3 30" />
    </svg>
  );
}

/** A follow spot: the lamp hunting for someone worth lighting. */
export function SpotlightSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  const fade = useSketchFade(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      {/* rig */}
      <motion.path {...strokeProps} {...draw(0)} d="M32 4 L32 1 M27 1 L37 1" />
      {/* the lamp, small — the beam has to be the big shape */}
      <motion.path {...strokeProps} {...draw(0)} d="M27 4 L37 4 L40 13 L24 13 Z" />
      <motion.path {...strokeProps} {...draw(1)} d="M24 13 C28 15.5 36 15.5 40 13" />
      {/* Dashed and splayed much wider than the lamp, so it reads as light
          rather than a solid cone — a narrow closed one came out as a bottle. */}
      <motion.g {...fade(2)}>
        <path {...strokeProps} strokeDasharray="4 5" d="M25 16 L6 52 M39 16 L58 52" />
      </motion.g>
      {/* the pool it throws, in perspective */}
      <motion.path
        {...strokeProps}
        {...draw(3)}
        d="M6 52 C6 49 17.6 46.5 32 46.5 C46.4 46.5 58 49 58 52 C58 55 46.4 57.5 32 57.5 C17.6 57.5 6 55 6 52 Z"
      />
    </Frame>
  );
}

/** Clapperboard — scene one, take one. The film and TV half of the library. */
export function ClapperSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      {/* the stick, hinged at the left and held open */}
      <motion.path {...strokeProps} {...draw(0)} d="M9 22 L53 11 L55 20 L11 31 Z" />
      <motion.path {...strokeProps} {...draw(1)} d="M22 18 L25 27 M34 15 L37 24 M46 12 L49 21" />
      {/* the slate */}
      <motion.path
        {...strokeProps}
        {...draw(2)}
        d="M8 30 L56 30 L56 54 C56 56 55 57 53 57 L11 57 C9 57 8 56 8 54 Z"
      />
      <motion.path {...strokeProps} {...draw(3)} d="M16 39 L48 39 M16 48 L38 48" />
    </Frame>
  );
}

/** A stack of sides, dog-eared. Twelve thousand pages, give or take. */
export function ScriptPagesSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      {/* the sheet underneath, just showing */}
      <motion.path {...strokeProps} {...draw(0)} d="M13 14 L13 51 C13 53 14 54 16 54 L43 54" />
      {/* the top sheet, corner turned */}
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M21 7 L46 7 L52 13 L52 46 C52 47.5 51 48.5 49.5 48.5 L21 48.5 C19.5 48.5 18.5 47.5 18.5 46 L18.5 9.5 C18.5 8 19.5 7 21 7 Z"
      />
      <motion.path {...strokeProps} {...draw(2)} d="M46 7 L46 13 L52 13" />
      {/* the speech on it */}
      <motion.path {...strokeProps} {...draw(3)} d="M25 22 L45 22 M25 29 L45 29 M25 36 L38 36" />
    </Frame>
  );
}

/** A ticket stub — the house, the seat, the night you kept the corner of. */
export function TicketSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  const fade = useSketchFade(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M8 20 L56 20 L56 44 C56 45.5 55 46.5 53.5 46.5 L10.5 46.5 C9 46.5 8 45.5 8 44 Z"
      />
      {/* where it tears */}
      <motion.g {...fade(1)}>
        <path {...strokeProps} strokeDasharray="3 4" d="M42 20 L42 46.5" />
      </motion.g>
      <motion.path {...strokeProps} {...draw(2)} d="M15 28 L34 28 M15 36 L27 36" />
      <motion.path {...strokeProps} {...draw(3)} d="M47 30 L51 30 M47 36 L51 36" />
    </Frame>
  );
}

/** Footlights along the lip of the stage — the house is warming up. */
export function FootlightsSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      {/* Redrawn: the old version put a wide arc across the top with three
          bumps and two horizontal rules under it, which at 88px in a dark room
          read unmistakably as a bridge over water. The arc is gone. What says
          "lights" is the beams, so they do the work — each lamp throws a pair
          of them, fanning up and off the top of the frame. */}
      {/* the lip of the stage */}
      <motion.path {...strokeProps} {...draw(0)} d="M4 50 L60 50 M4 55 L60 55" />
      {/* three hoods, sitting on it */}
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M9 50 A5 5 0 0 1 19 50 Z M27 50 A5 5 0 0 1 37 50 Z M45 50 A5 5 0 0 1 55 50 Z"
      />
      {/* what each one throws */}
      <motion.path
        {...strokeProps}
        {...draw(2)}
        d="M14 43 L7 21 M14 43 L21 21 M32 43 L25 21 M32 43 L39 21 M50 43 L43 21 M50 43 L57 21"
      />
    </Frame>
  );
}

/** A reel of film. The other half of the library, spinning. */
export function ReelSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path {...strokeProps} {...draw(0)} d="M32 8 A24 24 0 1 1 31.9 8 Z" />
      <motion.path {...strokeProps} {...draw(1)} d="M32 27 A5 5 0 1 1 31.9 27 Z" />
      <motion.path {...strokeProps} {...draw(2)} d="M32 13 A6 6 0 1 1 31.9 13 Z" />
      <motion.path {...strokeProps} {...draw(3)} d="M20.7 32.5 A6 6 0 1 1 20.6 32.5 Z" />
      <motion.path {...strokeProps} {...draw(3)} d="M43.3 32.5 A6 6 0 1 1 43.2 32.5 Z" />
    </Frame>
  );
}

/** The marquee out front, with the title still going up. */
export function MarqueeSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      {/* The building it hangs off. The canopy widens toward the bottom and the
          bulbs sit INSIDE it — an earlier version was narrow-bottomed with the
          bulbs slung underneath, which read unmistakably as a shopping cart. */}
      <motion.path {...strokeProps} {...draw(0)} d="M6 7 L58 7 M20 7 L20 15 M44 7 L44 15" />
      {/* the canopy */}
      <motion.path {...strokeProps} {...draw(1)} d="M16 15 L48 15 L54 37 L10 37 Z" />
      {/* tonight's billing */}
      <motion.path {...strokeProps} {...draw(2)} d="M20 22 L44 22 M24 29 L40 29" />
      {/* the bulbs, along the lip */}
      <motion.path
        {...strokeProps}
        {...draw(3)}
        d="M17.8 34 A1.8 1.8 0 1 1 17.7 34 Z M33.8 34 A1.8 1.8 0 1 1 33.7 34 Z M49.8 34 A1.8 1.8 0 1 1 49.7 34 Z"
      />
    </Frame>
  );
}
