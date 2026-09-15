"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * The one fixture.
 *
 * First-run used to carry three unrelated lamps in about ten seconds: a
 * glowing radial-gradient bulb hanging over the onboarding card, this drawn
 * lamp in the middle of it, and a third glowing bulb on /first-scene. Three
 * shapes, three animations, no relationship — which is what "bulbs floating in
 * from everywhere" actually was. It read as decoration applied per screen
 * rather than one room the actor is moving through.
 *
 * So the two glowing bulbs are gone and this drawing is the fixture everywhere.
 * It is a line drawing on purpose: a soft yellow radial gradient with a 70px
 * box-shadow bloom is the single most generated-looking thing on the page, and
 * it fought the hand-drawn register the rest of Theatre Walk is built in.
 *
 * `draw` animates the strokes in, for the one place there is a wait worth
 * covering. Everywhere else it is simply hung, already lit.
 *
 * Colour comes from `currentColor`, so the caller sets it with `color` and the
 * lamp works on paper and on ink without a dark rule of its own. The pool on
 * the floor reads `--lamp-acc`, falling back to currentColor where no accent is
 * bound (e.g. /first-scene, which sits outside the theatre-token scopes).
 */
export default function LampSketch({
  size = 96,
  draw = false,
  className,
}: {
  size?: number;
  /** Animate the strokes in. For covering a wait, not for decoration. */
  draw?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const animate = draw && !reduce;

  const drawn = (delay: number) =>
    animate
      ? {
          initial: { pathLength: 0 },
          animate: { pathLength: 1 },
          transition: { duration: 0.9, ease: "easeInOut" as const, delay },
        }
      : {};

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* cord */}
      <motion.path d="M32 4 L32 1 M27 1 L37 1" {...drawn(0.1)} />
      {/* shade */}
      <motion.path d="M27 4 L37 4 L40 13 L24 13 Z" {...drawn(0.1)} />
      <motion.path d="M24 13 C28 15.5 36 15.5 40 13" {...drawn(0.28)} />
      {/* The beam carries its own dashes, so it fades rather than draws:
          framer-motion writes strokeDasharray itself to implement pathLength
          and would stamp over the pattern. */}
      <motion.path
        d="M25 16 L6 52 M39 16 L58 52"
        strokeDasharray="4 5"
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.46 }}
      />
      {/* the pool on the floor */}
      <motion.path
        d="M6 52 C6 49 17.6 46.5 32 46.5 C46.4 46.5 58 49 58 52 C58 55 46.4 57.5 32 57.5 C17.6 57.5 6 55 6 52 Z"
        style={{ color: "var(--lamp-acc, currentColor)" }}
        {...drawn(0.64)}
      />
    </svg>
  );
}
