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
 *
 * They are pinned-up cards now: paper on a hard ink shadow, each at its own
 * slight angle, straightening as you reach for them. The glyphs are the brand
 * sketches the page already owned rather than the prototype's characters.
 */

const DOORS = [
  { Sketch: MasksSketch, label: "Something funny", query: "comedic monologue", rot: "-1.5deg" },
  { Sketch: SkullSketch, label: "Shakespeare", query: "shakespeare monologue", rot: "1deg" },
  { Sketch: RoseSketch, label: "Love", query: "monologue about love", rot: "-1deg" },
  { Sketch: DaggerSketch, label: "Revenge", query: "monologue about revenge", rot: "1.5deg" },
  { Sketch: CrownSketch, label: "Power", query: "monologue about power", rot: "-0.5deg" },
];

export function StartingPoints({ mode = "plays" }: { mode?: "plays" | "film_tv" }) {
  return (
    <section aria-label="Ways to start" className="mt-12">
      <p className="t-dir text-center" style={{ color: "var(--t-muted-dark-2)" }}>
        (or start somewhere.)
      </p>

      <div
        className="mt-6 grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}
      >
        {DOORS.map(({ Sketch, label, query, rot }, i) => (
          <Link
            key={label}
            href={`/monologues?mode=${mode}&q=${encodeURIComponent(query)}`}
            className="t-door group flex flex-col gap-3 p-5"
            style={{ ["--rot" as string]: rot }}
          >
            <Sketch size={34} delay={0.1 + i * 0.08} className="t-door__glyph" />
            <span className="text-base font-bold" style={{ color: "var(--t-text)" }}>
              {label}
            </span>
            <span
              style={{
                fontFamily: "var(--t-direction)",
                fontSize: 12,
                color: "var(--t-muted-dark-2)",
              }}
            >
              {query}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default StartingPoints;
