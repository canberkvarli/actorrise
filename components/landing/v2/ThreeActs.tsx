"use client";

import { motion } from "framer-motion";

const ACTS = [
  {
    numeral: "I",
    direction: "(the search.)",
    title: "Describe it. Don't dig for it.",
    body: "Plain English is enough. Funny piece for drama school, two minutes, male. The AI reads the whole library and hands you pieces that actually fit you, with overdone warnings so you never bring the piece everyone else brought.",
  },
  {
    numeral: "II",
    direction: "(the rehearsal.)",
    title: "Run lines at 2am if you want.",
    body: "Your AI scene partner reads every other role, holds the script, and waits for your cue. No scheduling, no favors to repay, no one getting tired on take twelve.",
  },
  {
    numeral: "III",
    direction: "(the room.)",
    title: "Walk in off book.",
    body: "You arrive with a piece chosen for you, rehearsed until it sits in your body. The work is done before you open the door. Now go book the room.",
  },
];

const rise = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.12 },
  }),
};

export function ThreeActs() {
  return (
    <section className="container mx-auto px-4 sm:px-6 py-16 sm:py-24" aria-label="How ActorRise works">
      <p className="stage-direction text-center text-xs sm:text-sm text-[var(--stage-muted)]">
        (how it works, in three acts.)
      </p>

      <div className="mt-10 sm:mt-14 grid gap-10 md:gap-6 md:grid-cols-3 max-w-6xl mx-auto">
        {ACTS.map((act, i) => (
          <motion.article
            key={act.numeral}
            custom={i}
            variants={rise}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.35 }}
            className="relative border-t border-[var(--stage-line)] pt-8 md:pt-10"
          >
            <span
              aria-hidden
              className="absolute -top-7 sm:-top-9 right-0 font-serif text-[5rem] sm:text-[6.5rem] leading-none font-semibold text-transparent select-none [-webkit-text-stroke:1px_var(--stage-line)]"
            >
              {act.numeral}
            </span>
            <p className="stage-direction text-xs text-primary">{act.direction}</p>
            <h3 className="mt-3 font-brand text-2xl sm:text-[1.7rem] font-semibold tracking-[-0.01em] text-[var(--stage-fg)]">
              {act.title}
            </h3>
            <p className="mt-3 text-sm sm:text-[0.95rem] leading-relaxed text-[var(--stage-muted)]">
              {act.body}
            </p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
