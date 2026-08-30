"use client";

import Link from "next/link";

import {
  CrownSketch,
  DaggerSketch,
  MasksSketch,
  RoseSketch,
  SkullSketch,
} from "@/components/brand/sketches";

/**
 * Ways in, for the actor staring at an empty search box. Each drawing is a
 * search — they're doors, not decoration — so the blank pre-search screen
 * gives you somewhere to press instead of asking you to phrase it yourself.
 */

const DOORS = [
  { Sketch: MasksSketch, label: "Something funny", query: "comedic monologue" },
  { Sketch: SkullSketch, label: "Shakespeare", query: "shakespeare monologue" },
  { Sketch: RoseSketch, label: "Love", query: "monologue about love" },
  { Sketch: DaggerSketch, label: "Revenge", query: "monologue about revenge" },
  { Sketch: CrownSketch, label: "Power", query: "monologue about power" },
];

export function StartingPoints({ mode = "plays" }: { mode?: "plays" | "film_tv" }) {
  return (
    <section aria-label="Ways to start" className="mt-8 sm:mt-10">
      <p className="stage-direction text-center text-xs text-muted-foreground/70 sm:text-sm">
        (or start somewhere.)
      </p>

      <div className="mx-auto mt-5 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {DOORS.map(({ Sketch, label, query }, i) => (
          <Link
            key={label}
            href={`/monologues?mode=${mode}&q=${encodeURIComponent(query)}`}
            className="group flex flex-col items-center gap-3 rounded-lg border border-border/60 bg-card/30 px-3 py-5 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/60"
          >
            <Sketch
              size={44}
              delay={0.1 + i * 0.08}
              className="text-muted-foreground/60 transition-colors duration-300 group-hover:text-primary"
            />
            <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground sm:text-sm">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default StartingPoints;
