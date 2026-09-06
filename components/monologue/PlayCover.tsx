"use client";

import { motion } from "framer-motion";
import { Glyph, glyphFor, type GlyphName } from "@/components/brand/glyphs";

/**
 * A play has no poster, and there is no rights-clean source for 232 of them.
 * So it gets a cover printed rather than photographed: cloth, an emblem, and
 * the title set like a spine.
 *
 * Everything here is derived from the row itself — nothing is stored, nothing
 * is uploaded, nothing is generated at request time. The emblem comes from the
 * stage-glyph catalogue and the cloth from a hash of the title, so the whole
 * catalogue is covered for a few KB; they take `currentColor` and scale. A
 * folder of generated raster covers would do neither and would cost storage.
 *
 * Measured over the 15,800 play monologues, the resolution produces ten
 * distinct emblems — crown 35%, laurel 31%, rose 23%, dagger 6%, then a tail of
 * lantern / samovar / bear / skull / unicorn / donkey — and never falls through
 * to the neutral curtain.
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

/** "A Midsummer Night's Dream" → "a-midsummer-nights-dream", the CONTEXT key form. */
function slug(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")        // "night's" → "nights", matching the map's keys
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Anton Chekhov" → "chekhov". The map keys authors by surname. */
function authorSlug(s: string | null | undefined): string {
  const parts = slug(s).split("-").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/**
 * Which emblem, resolved through the glyph catalogue's own context map.
 *
 * This used to pick from six hand-drawn sketches by genre keyword, so every
 * tragedy got the same skull and every comedy the same masks. The catalogue
 * knows individual plays — Macbeth's dagger, Midsummer's donkey, Streetcar's
 * lantern, Salesman's suitcase, the Menagerie's unicorn, Godot's bowler,
 * Chekhov's samovar — so a cover can be about its play rather than its genre.
 *
 * Resolution order is the one the catalogue prescribes: play → author → first
 * tag → nothing. "Skip rather than guess" is why the fallback is the curtain
 * (page:landing / state:end) rather than a wrong specific.
 */
export function emblemFor(opts: {
  genre?: string | null;
  category?: string | null;
  themes?: string[] | null;
  title?: string | null;
  author?: string | null;
}): GlyphName {
  const tagKeys = [
    ...(opts.themes ?? []).map((t) => `tag:${slug(t)}`),
    opts.genre ? `tag:${slug(opts.genre)}` : "",
    // classical → laurel, contemporary → lantern. Last, so a piece about power
    // still gets its crown; this is the floor, not the first answer. It carries
    // ~31% of the catalogue on its own, because `genre` is the literal string
    // "drama" for almost every play and "drama" is not a context key.
    opts.category ? `tag:${slug(opts.category)}` : "",
  ].filter(Boolean);

  // Author is looked up by surname and only resolves for authors the catalogue
  // names — Chekhov's samovar. Shakespeare deliberately does not resolve here:
  // the map ties him to the skull via tag:shakespeare, and stamping a skull on
  // As You Like It would be worse than letting the themes decide.
  return (
    glyphFor(
      `play:${slug(opts.title)}`,
      `author:${authorSlug(opts.author)}`,
      ...tagKeys,
    ) ?? "curtain"
  );
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
  category,
  themes,
  className,
}: {
  title: string;
  author?: string | null;
  year?: number | null;
  genre?: string | null;
  /** classical | contemporary — the catalogue's floor when nothing else hits. */
  category?: string | null;
  themes?: string[] | null;
  className?: string;
}) {
  const cloth = CLOTHS[hash(title) % CLOTHS.length];
  const emblem = emblemFor({ genre, category, themes, title, author });

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
        {/* No `draw`: the catalogue's draw mode is whileInView, and a cover
            emblem must never depend on an observer firing — that is how you get
            a coloured rectangle with nothing on it. Static renders immediately. */}
        <Glyph name={emblem} size={54} />
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
