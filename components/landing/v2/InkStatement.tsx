"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";

/**
 * A single big statement whose words ink in one by one as you scroll
 * through it — the reader's pace sets the line's pace.
 */

const WORDS = "The right piece, in your body, before you open the door.".split(" ");

function Word({
  word,
  index,
  total,
  progress,
}: {
  word: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = (index / total) * 0.75;
  const opacity = useTransform(progress, [start, start + 0.22], [0.14, 1]);
  // The space lives outside the inline-block span, or the browser eats it.
  return (
    <>
      <motion.span style={{ opacity }} className="inline-block">
        {word}
      </motion.span>{" "}
    </>
  );
}

export function InkStatement() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.45"],
  });

  return (
    <section ref={ref} className="container mx-auto px-4 sm:px-6 py-20 sm:py-28" aria-label="Why it matters">
      <p className="stage-direction text-center text-xs sm:text-sm text-muted-foreground/70">
        (the point.)
      </p>
      <p className="mt-6 mx-auto max-w-3xl text-center font-brand font-medium leading-[1.3] text-3xl sm:text-4xl md:text-5xl text-balance">
        {reduce
          ? WORDS.join(" ")
          : WORDS.map((w, i) => (
              <Word key={i} word={w} index={i} total={WORDS.length} progress={scrollYProgress} />
            ))}
      </p>
    </section>
  );
}
