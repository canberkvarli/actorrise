/**
 * The house curve, and the one way things arrive.
 *
 * Entrances were being written per file: [0.22, 1, 0.36, 1] appears in nearly
 * fifty places, each with its own duration, its own per-index delay and its own
 * answer to "does this respect reduced motion" (mostly: no). The result is that
 * two lists a tab apart come in at visibly different speeds, and the search
 * results — eighteen rows at 0.07s each — were still arriving nearly a second
 * after the page had otherwise settled.
 *
 * Three rules, and they are the whole file:
 *
 *  1. One ease. Decelerating, no overshoot. A spring that overshoots looks
 *     charming on a single pill and looks like a typo on a page of prose,
 *     because the type scales past its size and back.
 *  2. Rows arrive in a WAVE, not a queue. The stagger is small and the total
 *     is capped: everything is on screen within a third of a second however
 *     long the list is, so the last row is never something you wait for.
 *  3. Reduced motion is answered here, once, rather than at each call site.
 */

/** Decelerate in, no bounce. Framer wants a plain 4-tuple. */
export const ENTER_EASE = [0.22, 1, 0.36, 1] as const;

/** Leaving is faster than arriving, and accelerates out. */
export const EXIT_EASE = [0.4, 0, 1, 1] as const;

export interface EntranceOptions {
  /** Honour prefers-reduced-motion — pass useReducedMotion(). */
  reduce?: boolean | null;
  /** Seconds before the first item moves. */
  base?: number;
  /** Seconds added per item. */
  step?: number;
  /** The last item never waits longer than this, whatever the index. */
  cap?: number;
  duration?: number;
  /** Distance travelled, in px. Rows rise; wide blocks barely move. */
  y?: number;
}

/**
 * Motion props for the nth element of a list.
 *
 * Spread onto any motion element:
 *   <motion.li {...entrance(i, { reduce })} />
 *
 * With `reduce` set, everything is already in place on the first frame — no
 * transform, no opacity ramp, nothing to wait for.
 */
export function entrance(index = 0, opts: EntranceOptions = {}) {
  const { reduce = false, base = 0.04, step = 0.045, cap = 0.34, duration = 0.45, y = 12 } = opts;

  if (reduce) {
    return { initial: false as const, animate: { opacity: 1, y: 0 } };
  }

  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: {
      delay: Math.min(base + index * step, cap),
      duration,
      ease: ENTER_EASE,
    },
  };
}

/** The same beat, as variants, for a parent that drives its own children. */
export const revealVariants = {
  hidden: (y: number = 12) => ({ opacity: 0, y }),
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(0.04 + i * 0.045, 0.34), duration: 0.45, ease: ENTER_EASE },
  }),
};
