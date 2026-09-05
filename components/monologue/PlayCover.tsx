"use client";

import { motion } from "framer-motion";
import {
  SkullSketch,
  MasksSketch,
  CrownSketch,
  RoseSketch,
  DaggerSketch,
  GhostLightSketch,
} from "@/components/brand/sketches";

/**
 * A play has no poster, and there is no rights-clean source for 232 of them.
 * So it gets a cover printed rather than photographed: cloth, an emblem, and
 * the title set like a spine.
 *
 * Everything here is derived from the row itself — nothing is stored, nothing
 * is uploaded, nothing is generated at request time. Six SVG emblems and six
 * cloth colours cover the whole catalogue for about 3KB, they take
 * `currentColor` so they invert with the theme, and they animate. A folder of
 * generated raster covers would do none of that and would cost real storage.
 */

/** Deterministic, so The Seagull is the same green on every visit. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* Bindings, not brand colours: the muted end of cloth. Each carries cream ink
   at well past 4.5:1, and each is dark enough to sit on the banner without a
   border to separate it. */
const CLOTHS = [
  { bg: "oklch(0.32 0.055 155)", ink: "oklch(0.94 0.02 90)" }, // forest
  { bg: "oklch(0.31 0.085 25)", ink: "oklch(0.94 0.02 90)" },  // oxblood
  { bg: "oklch(0.30 0.065 255)", ink: "oklch(0.94 0.02 90)" }, // navy
  { bg: "oklch(0.34 0.070 70)", ink: "oklch(0.95 0.02 90)" },  // tobacco
  { bg: "oklch(0.31 0.045 300)", ink: "oklch(0.94 0.02 90)" }, // plum
  { bg: "oklch(0.30 0.020 240)", ink: "oklch(0.93 0.02 90)" }, // slate
] as const;

const EMBLEMS = {
  masks: MasksSketch,
  skull: SkullSketch,
  crown: CrownSketch,
  rose: RoseSketch,
  dagger: DaggerSketch,
  ghost: GhostLightSketch,
} as const;

/**
 * Which emblem. Ordered most-specific first: a revenge tragedy should get the
 * dagger, not the generic skull, and a comedy should never get either.
 *
 * Jester and Curtain are deliberately not in the set. Rendered at size the
 * jester is a rabbit — three antennae with beads on a dome — and the curtain
 * is a shallow arc that reads as nothing at all.
 */
export function emblemFor(opts: {
  genre?: string | null;
  themes?: string[] | null;
  title?: string | null;
}): keyof typeof EMBLEMS {
  const g = (opts.genre ?? "").toLowerCase();
  const hay = [(opts.themes ?? []).join(" "), opts.title ?? ""].join(" ").toLowerCase();
  const has = (...words: string[]) => words.some((w) => hay.includes(w));

  if (g.includes("comed") || has("comedy", "farce")) return "masks";
  if (has("revenge", "murder", "betrayal", "blood", "assassin")) return "dagger";
  if (has("love", "romance", "marriage", "desire", "longing", "lovers")) return "rose";
  if (g.includes("histor") || has("power", "ambition", "king", "queen", "crown", "throne"))
    return "crown";
  if (g.includes("traged") || has("death", "grief", "mortality", "fate", "madness"))
    return "skull";
  return "ghost";
}

/** The cloth a given title is bound in — so the banner behind it can match. */
export function clothFor(title: string) {
  return CLOTHS[hash(title) % CLOTHS.length];
}

export function PlayCover({
  title,
  author,
  year,
  genre,
  themes,
  className,
}: {
  title: string;
  author?: string | null;
  year?: number | null;
  genre?: string | null;
  themes?: string[] | null;
  className?: string;
}) {
  const cloth = CLOTHS[hash(title) % CLOTHS.length];
  const Emblem = EMBLEMS[emblemFor({ genre, themes, title })];

  return (
    <div
      className={`relative flex aspect-[2/3] flex-col items-center justify-between overflow-hidden rounded-sm px-4 py-6 text-center sm:px-5 sm:py-7 ${className ?? ""}`}
      style={{ backgroundColor: cloth.bg, color: cloth.ink }}
    >
      {/* A blind-stamped rule inset from the edge, the way a cloth binding is
          tooled. Pure colour maths off the ink so it works on all six cloths. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[7px] rounded-[2px] border"
        style={{ borderColor: "color-mix(in oklab, currentColor 22%, transparent)" }}
      />

      <p
        className="font-typewriter text-[9px] uppercase tracking-[0.2em] opacity-55 sm:text-[10px]"
        style={{ lineHeight: 1.4 }}
      >
        {year || " "}
      </p>

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 0.92, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* eager: the emblem is the artwork on this card, not an accent. Left
            on whileInView it stays at pathLength 0 until an observer fires,
            and a cover with an invisible emblem is just a coloured rectangle. */}
        <Emblem size={54} eager />
      </motion.div>

      <div className="w-full">
        <div
          aria-hidden
          className="mx-auto mb-2.5 h-px w-8"
          style={{ backgroundColor: "color-mix(in oklab, currentColor 40%, transparent)" }}
        />
        {/* text-balance keeps a three-word title from dropping one word alone
            onto the last line, which is the usual way a generated cover
            announces that it was generated. */}
        <p className="font-playbill text-balance text-[15px] leading-[0.95] sm:text-[19px]">
          {title}
        </p>
        {author && (
          <p className="mt-2 font-typewriter text-[9px] uppercase tracking-[0.14em] opacity-60 sm:text-[10px]">
            {author}
          </p>
        )}
      </div>
    </div>
  );
}
