"use client";

import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";

/**
 * ActorRise stage glyphs. One stroke weight, round caps, currentColor, no captions.
 * Place them contextually: the skull over a Hamlet piece, the clapper in Film & TV
 * search, the suitcase on an empty book. See CONTEXT for the mapping.
 *
 *   <Glyph name="skull" size={72} className="text-muted-foreground" />
 *   <Glyph name={glyphFor("play:hamlet")} />
 *
 * Generated from glyphs/glyphs-data.js.
 *
 * ── Local notes, not part of the generated file ────────────────────────────
 * Imported from the "Website redesign with animations" Claude Design project
 * (glyphs/glyphs.tsx) on 2026-09-06. Kept VERBATIM apart from this comment so a
 * future re-sync is a clean diff. The house rules from glyphs/README.md:
 *
 *   - Muted ink only: text-muted-foreground on cream, text-[var(--stage-faint)]
 *     on the dark layer. Never the orange, never filled.
 *   - 72-96 as a header mark, 88 centred on an empty state, 22-24 in a chip.
 *   - ONE glyph per view. It replaces a heading ornament, it does not sit
 *     beside one.
 *   - Resolution order for a piece: play: → author: → first tag: → nothing.
 *     Skip rather than guess.
 *   - These do not replace the 64px sketches in sketches.tsx on buttons. They
 *     take over at header and empty-state scale only.
 *
 * `draw` uses whileInView, so the strokes sit at pathLength 0 until an
 * IntersectionObserver fires. That is right for something scrolled to and wrong
 * for anything above the fold or inside a control — see the `eager` prop on
 * sketches.tsx for why. Default is off, which renders statically.
 */

export const GLYPHS = {
  "skull": [
    "M50 8 C32 8 22 22 22 38 C22 48 27 56 34 60 L34 70 C34 74 37 76 40 76 L60 76 C63 76 66 74 66 70 L66 60 C73 56 78 48 78 38 C78 22 68 8 50 8 Z",
    "M33 40 a7 6 0 1 0 14 0 a7 6 0 1 0 -14 0 M53 40 a7 6 0 1 0 14 0 a7 6 0 1 0 -14 0",
    "M50 48 L46 57 L54 57 Z",
    "M42 68 L42 76 M50 68 L50 76 M58 68 L58 76",
    "M30 92 L70 92"
  ],
  "dagger": [
    "M50 92 L42 44 L42 34 L58 34 L58 44 Z",
    "M50 46 L50 78",
    "M30 32 L70 32",
    "M45 32 L44 14 L56 14 L55 32",
    "M45 6 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0"
  ],
  "crown": [
    "M18 76 L82 76 L82 62 L18 62 Z",
    "M18 62 L14 34 L32 48 L50 24 L68 48 L86 34 L82 62",
    "M11 30 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M47 20 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M83 30 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M30 69 L70 69"
  ],
  "rose": [
    "M30 30 L38 22 L46 30 L54 20 L62 30 L70 22 L70 42 C70 56 62 64 50 64 C38 64 30 56 30 42 Z",
    "M50 64 L50 94",
    "M50 78 C42 74 34 76 30 84 C38 86 46 84 50 78 Z"
  ],
  "cauldron": [
    "M22 44 L78 44 C80 66 68 82 50 82 C32 82 20 66 22 44 Z",
    "M14 44 L86 44",
    "M36 82 L32 92 M64 82 L68 92",
    "M38 34 C36 26 42 24 40 16 M50 34 C48 26 54 24 52 14 M62 34 C60 26 66 24 64 16"
  ],
  "bear": [
    "M14 30 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0",
    "M66 30 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0",
    "M50 20 C30 20 18 36 18 54 C18 72 32 86 50 86 C68 86 82 72 82 54 C82 36 70 20 50 20 Z",
    "M37 50 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M57 50 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M50 64 C44 64 40 60 40 58 C44 56 56 56 60 58 C60 60 56 64 50 64 Z",
    "M50 64 L50 70 M44 74 C46 76 54 76 56 74"
  ],
  "donkey": [
    "M30 44 C26 32 26 18 30 8 C36 14 40 28 40 42",
    "M44 40 C42 28 44 14 50 8 C54 16 54 30 52 40",
    "M30 44 C22 48 18 58 22 68 C26 76 34 80 44 80",
    "M44 80 C58 82 76 80 88 72 C94 68 94 60 88 58 C82 56 76 60 70 58 C62 56 56 50 52 40",
    "M38 56 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M84 66 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0",
    "M40 42 L44 40 M30 44 L40 42"
  ],
  "lantern": [
    "M50 4 L50 14",
    "M38 14 L62 14 L62 20 L38 20 Z",
    "M22 48 C22 30 34 20 50 20 C66 20 78 30 78 48 C78 66 66 76 50 76 C34 76 22 66 22 48 Z",
    "M36 22 C30 36 30 60 36 74 M50 20 L50 76 M64 22 C70 36 70 60 64 74",
    "M40 76 L60 76 L60 82 L40 82 Z",
    "M50 82 L50 96"
  ],
  "suitcase": [
    "M14 38 L86 38 L86 84 L14 84 Z",
    "M36 38 L36 28 L64 28 L64 38",
    "M14 52 L86 52",
    "M44 52 L44 58 L56 58 L56 52"
  ],
  "unicorn": [
    "M20 92 C20 74 24 58 30 46 L28 34 L38 40 C42 36 48 34 54 36 C66 40 78 48 88 54 C92 58 92 64 86 66 C78 68 70 66 64 68 C58 72 56 80 56 92",
    "M48 34 L54 10 L56 36",
    "M57.5 48 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0",
    "M16 92 L60 92"
  ],
  "bowler": [
    "M28 56 C28 38 38 26 50 26 C62 26 72 38 72 56 Z",
    "M12 62 C12 58 28 56 50 56 C72 56 88 58 88 62 C88 66 72 68 50 68 C28 68 12 66 12 62 Z",
    "M32 50 L68 50"
  ],
  "laurel": [
    "M50 88 C30 82 20 60 22 26",
    "M50 88 C70 82 80 60 78 26",
    "M40 84 C41.7 79.3 28.6 74.5 26.8 79.2 C25.1 83.9 38.3 88.7 40 84 Z M30 72 C31.3 67.1 17.8 63.5 16.5 68.4 C15.2 73.2 28.7 76.9 30 72 Z M24 56 C24.9 51 11.1 48.6 10.2 53.6 C9.3 58.5 23.1 61 24 56 Z M22 40 C22.4 35 8.5 33.8 8.1 38.8 C7.6 43.8 21.6 45 22 40 Z M22 26 C26.7 24.3 21.9 11.1 17.2 12.8 C12.5 14.6 17.3 27.7 22 26 Z",
    "M60 84 C61.7 88.7 74.9 83.9 73.2 79.2 C71.4 74.5 58.3 79.3 60 84 Z M70 72 C71.3 76.9 84.8 73.2 83.5 68.4 C82.2 63.5 68.7 67.1 70 72 Z M76 56 C76.9 61 90.7 58.5 89.8 53.6 C88.9 48.6 75.1 51 76 56 Z M78 40 C78.4 45 92.4 43.8 91.9 38.8 C91.5 33.8 77.6 35 78 40 Z M78 26 C82.7 27.7 87.5 14.6 82.8 12.8 C78.1 11.1 73.3 24.3 78 26 Z"
  ],
  "samovar": [
    "M28 36 C20 44 20 66 30 76 L70 76 C80 66 80 44 72 36 Z",
    "M28 36 L72 36 M36 36 C38 28 62 28 64 36",
    "M46 28 L46 16 L54 16 L54 28",
    "M20 46 C12 46 12 58 20 58 M80 46 C88 46 88 58 80 58",
    "M50 62 L50 70 M44 70 L56 70 M50 70 L50 76",
    "M26 82 L74 82 M32 76 L32 82 M68 76 L68 82"
  ],
  "curtain": [
    "M4 8 L96 8 L96 20 C84 26 74 14 62 20 C50 26 50 26 38 20 C26 14 16 26 4 20 Z",
    "M8 20 C10 40 12 60 8 86 C18 84 26 88 32 84 C30 60 28 40 30 20",
    "M92 20 C90 40 88 60 92 86 C82 84 74 88 68 84 C70 60 72 40 70 20",
    "M14 20 C16 40 18 60 20 84 M22 20 C24 40 26 60 26 84 M86 20 C84 40 82 60 80 84 M78 20 C76 40 74 60 74 84",
    "M2 92 L98 92"
  ],
  "chair": [
    "M32 10 Q50 6 68 10 M32 10 L30 52 M68 10 L70 52 M31 46 L69 46",
    "M44 12 L43 46 M56 12 L57 46",
    "M22 52 L78 52 L78 58 L22 58 Z",
    "M26 58 L24 92 M74 58 L76 92 M24 78 L76 78"
  ],
  "stage-door": [
    "M20 90 L20 14 L80 14 L80 90",
    "M28 90 L28 22 L58 30 L58 90",
    "M51 58 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0",
    "M30 4 L70 4 L70 10 L30 10 Z",
    "M58 90 L92 90 L58 72 Z",
    "M10 90 L90 90"
  ],
  "mirror": [
    "M22 84 L22 34 C22 18 34 10 50 10 C66 10 78 18 78 34 L78 84",
    "M10 84 L90 84 L90 92 L10 92 Z",
    "M13 60 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M13 40 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M23 22 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M39 10 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M55 10 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M71 22 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M81 40 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M81 60 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
    "M36 70 L62 30"
  ],
  "seats": [
    "M10 80 L10 50 C10 42 16 38 24 38 C32 38 38 42 38 50 L38 80 Z",
    "M36 80 L36 50 C36 42 42 38 50 38 C58 38 64 42 64 50 L64 80 Z",
    "M62 80 L62 50 C62 42 68 38 76 38 C84 38 90 42 90 50 L90 80 Z",
    "M4 88 L96 88"
  ],
  "masks": [
    "M6 24 C12 14 40 14 46 24 C48 40 44 64 36 78 C32 84 20 84 16 78 C8 64 4 40 6 24 Z",
    "M12 38 C16 33 24 33 26 38 C24 43 16 43 12 38 Z M28 38 C30 33 38 33 42 38 C38 43 30 43 28 38 Z",
    "M14 54 C18 68 36 68 40 54 C34 58 20 58 14 54 Z",
    "M54 24 C60 14 88 14 94 24 C96 40 92 64 84 78 C80 84 68 84 64 78 C56 64 52 40 54 24 Z",
    "M60 40 C64 35 72 35 74 40 C72 45 64 45 60 40 Z M76 40 C78 35 86 35 90 40 C86 45 78 45 76 40 Z",
    "M62 70 C66 56 84 56 88 70 C82 66 68 66 62 70 Z"
  ],
  "clapper": [
    "M14 44 L86 44 L86 88 L14 88 Z",
    "M14 36 L86 36 L86 44 L14 44 Z M32 36 L36 44 M50 36 L54 44 M68 36 L72 44",
    "M14 36 L78 8 L81 15 L17 43 Z M34 31 L37 38 M50 24 L53 31 M66 17 L69 24",
    "M22 62 L78 62"
  ],
  "camera": [
    "M24 44 L66 44 L66 72 L24 72 Z",
    "M66 50 L82 42 L82 74 L66 66",
    "M24 30 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M50 30 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0",
    "M45 72 L45 80 M30 92 L45 80 L60 92"
  ],
  "on-air": [
    "M10 28 L90 28 L90 64 L10 64 Z",
    "M18 54 L18 40 a4.5 4.5 0 0 1 9 0 L27 54 a4.5 4.5 0 0 1 -9 0 Z",
    "M33 54 L33 38 L42 54 L42 38",
    "M52 54 L56.5 38 L61 54 M53.5 49 L59.5 49",
    "M67 38 L67 54 M73 54 L73 38 L79 38 a4 4 0 0 1 0 8 L73 46 M76 46 L80 54",
    "M30 20 L28 12 M50 20 L50 10 M70 20 L72 12 M50 64 L50 78 M36 78 L64 78"
  ],
  "directors-chair": [
    "M24 16 L76 16 L74 34 L26 34 Z",
    "M22 10 L30 60 M78 10 L70 60",
    "M20 60 L80 60 L78 68 L22 68 Z",
    "M22 68 L66 94 M78 68 L34 94",
    "M36 25 L64 25"
  ],
  "phone-tripod": [
    "M34 6 L66 6 C69 6 70 7 70 10 L70 62 C70 65 69 66 66 66 L34 66 C31 66 30 65 30 62 L30 10 C30 7 31 6 34 6 Z",
    "M42 12 L58 12",
    "M42 40 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0",
    "M44 66 L56 66 L56 72 L44 72 Z",
    "M50 72 L50 80 M50 80 L32 94 M50 80 L68 94 M50 80 L50 94"
  ],
  "sides": [
    "M26 8 L66 8 L76 18 L76 92 L26 92 Z",
    "M66 8 L66 18 L76 18",
    "M36 34 L66 34 M36 46 L60 46 M36 58 L66 58 M36 70 L56 70",
    "M36 82 L50 82",
    "M22 14 L22 96 L70 96"
  ],
  "ticket": [
    "M12 30 L88 30 L88 46 a8 8 0 0 0 0 16 L88 78 L12 78 L12 62 a8 8 0 0 0 0 -16 Z",
    "M62 34 L62 74",
    "M24 44 L50 44 M24 54 L46 54 M24 64 L40 64",
    "M70 54 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0"
  ],
  "star": [
    "M50 10 L60 38 L90 40 L66 58 L74 88 L50 70 L26 88 L34 58 L10 40 L40 38 Z"
  ],
  "bat-cowl": [
    "M20 14 L32 30 C44 24 56 24 68 30 L80 14",
    "M20 14 C14 40 18 66 32 80 C42 90 58 90 68 80 C82 66 86 40 80 14",
    "M30 48 C36 44 44 46 48 52 L30 56 Z",
    "M70 48 C64 44 56 46 52 52 L70 56 Z",
    "M38 74 C44 70 56 70 62 74"
  ],
  "script-pen": [
    "M22 12 L64 12 L78 26 L78 88 L22 88 Z",
    "M64 12 L64 26 L78 26",
    "M32 40 L68 40 M32 52 L60 52 M32 64 L54 64",
    "M84 46 L62 82 L58 90 L66 86 L88 50 Z"
  ],
  "pin-note": [
    "M24 26 L76 22 L78 76 L26 80 Z",
    "M50 12 a5 5 0 1 0 0.1 0 M50 17 L50 30",
    "M34 42 L66 40 M34 54 L60 52 M34 66 L56 64"
  ]
} as const;

export type GlyphName = keyof typeof GLYPHS;

/** context key → glyph ids, first is preferred. Keys: play:<slug>, author:<slug>, tag:<slug>, mode:film-tv, page:<slug>, state:<slug>, feature:<slug>, plan:<slug>. */
export const CONTEXT: Record<string, GlyphName[]> = {
  "play:hamlet": ["skull"],
  "tag:tragedy": ["skull"],
  "tag:shakespeare": ["skull"],
  "play:macbeth": ["dagger", "cauldron"],
  "tag:revenge": ["dagger"],
  "tag:villain": ["dagger"],
  "play:king-lear": ["crown"],
  "play:richard-iii": ["crown"],
  "play:henry-v": ["crown"],
  "tag:power": ["crown"],
  "tag:history": ["crown"],
  "play:romeo-and-juliet": ["rose"],
  "tag:love": ["rose"],
  "tag:romance": ["rose"],
  "tag:witches": ["cauldron"],
  "tag:supernatural": ["cauldron"],
  "play:the-winters-tale": ["bear"],
  "state:404": ["bear"],
  "state:signed-out": ["bear"],
  "play:a-midsummer-nights-dream": ["donkey"],
  "tag:comedy": ["donkey"],
  "tag:fairies": ["donkey"],
  "play:a-streetcar-named-desire": ["lantern"],
  "tag:american": ["lantern", "suitcase"],
  "tag:contemporary": ["lantern"],
  "play:death-of-a-salesman": ["suitcase"],
  "state:book-empty": ["suitcase"],
  "play:the-glass-menagerie": ["unicorn"],
  "tag:memory": ["unicorn"],
  "tag:fragile": ["unicorn"],
  "play:waiting-for-godot": ["bowler"],
  "tag:absurdist": ["bowler"],
  "state:loading": ["bowler"],
  "tag:greek": ["laurel"],
  "tag:classical": ["laurel"],
  "state:success": ["laurel", "star"],
  "author:chekhov": ["samovar"],
  "tag:russian": ["samovar"],
  "tag:naturalism": ["samovar"],
  "page:landing": ["curtain"],
  "state:section-divider": ["curtain"],
  "state:end": ["curtain"],
  "page:reader": ["chair", "sides"],
  "state:paused": ["chair"],
  "page:rehearse": ["chair"],
  "page:sign-in": ["stage-door"],
  "page:sign-up": ["stage-door"],
  "state:enter": ["stage-door"],
  "page:profile": ["mirror"],
  "page:settings": ["mirror"],
  "page:callboard": ["mirror", "seats", "pin-note"],
  "state:presence": ["seats"],
  "page:greenroom": ["seats", "on-air"],
  "tag:genre": ["masks"],
  "page:browse": ["masks"],
  "page:about": ["masks"],
  "mode:film-tv": ["clapper", "camera", "bat-cowl"],
  "tag:film": ["clapper"],
  "tag:tv": ["clapper"],
  "feature:self-tape": ["camera", "phone-tripod"],
  "state:recording": ["camera"],
  "state:live": ["on-air"],
  "feature:voice": ["on-air"],
  "tag:director": ["directors-chair"],
  "plan:educator": ["directors-chair"],
  "feature:feedback": ["directors-chair"],
  "feature:upload": ["phone-tripod"],
  "tag:audition": ["phone-tripod"],
  "feature:memorize": ["sides"],
  "page:book": ["sides"],
  "page:pricing": ["ticket"],
  "state:trial": ["ticket"],
  "state:opening-night": ["ticket"],
  "state:callback": ["star"],
  "feature:save": ["star"],
  "tag:superhero": ["bat-cowl"],
  "tag:action": ["bat-cowl"],
  "feature:request": ["script-pen"],
  "state:no-results": ["script-pen"],
  "page:founder": ["script-pen"],
  "feature:founder-notes": ["pin-note"],
} as Record<string, GlyphName[]>;

export function glyphFor(...keys: string[]): GlyphName | undefined {
  for (const k of keys) {
    const hit = CONTEXT[k];
    if (hit?.length) return hit[0];
  }
  return undefined;
}

export type GlyphProps = {
  name: GlyphName;
  /** rendered size in px (square) */
  size?: number;
  className?: string;
  /** stroke width on the 100 grid; bump to 4 under 32px */
  stroke?: number;
  /** draw the strokes in when first in view */
  draw?: boolean;
  delay?: number;
  title?: string;
};

export function Glyph({ name, size = 64, className, stroke, draw = false, delay = 0, title }: GlyphProps) {
  const reduce = useReducedMotion();
  const paths = GLYPHS[name];
  const sw = stroke ?? (size < 32 ? 4 : 3.2);
  const animate = draw && !reduce;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {paths.map((d, i) =>
        animate ? (
          <motion.path
            key={i}
            d={d}
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{
              pathLength: { duration: 0.7, ease: "easeOut", delay: delay + i * 0.12 },
              opacity: { duration: 0.01, delay: delay + i * 0.12 },
            }}
          />
        ) : (
          <path key={i} d={d} />
        ),
      )}
    </svg>
  );
}
