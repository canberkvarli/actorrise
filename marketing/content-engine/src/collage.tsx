// Cut-paper collage world (Canberk, 2026-11-20: "a very different concept", he picked the cut-paper collage).
// Torn coloured paper with soft shadows, NO outlines, paper grain, Archivo Black on torn paper cards, Caveat for
// handwritten notes. Milo keeps his mustard scarf, messy dark hair and tote bag; everything else is drawn new.
// Reference: reference/concepts/concepts.png (C). Use these pieces in new collage scenes; never mix in the
// outlined Ink drawings from StoryVideo.
import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/fonts";

loadFont({ family: "ArchivoBlack", url: staticFile("fonts/archivo-black.woff2"), weight: "400" });
loadFont({ family: "Caveat", url: staticFile("fonts/caveat.woff2"), weight: "700" });

export const P = {
  teal: "#1f5c5a", tealDeep: "#17474a", rust: "#b5532e", cream: "#f3ead8", ink: "#1f2a2a",
  red: "#c8361b", mustard: "#e2a72a", navy: "#2d3e66", skin: "#e7b48f", skin2: "#c98f68", skin3: "#8a5a3c",
  hair: "#1b1512", hair2: "#5a3a22", kraft: "#d9cbb0", white: "#fbf7ee", pink: "#e98aa0", green: "#5f8f5a",
};

/** Filters every collage frame needs. Render once per frame, before the pieces. */
export const CollageDefs: React.FC = () => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      {/* torn edge + the shadow a cut piece casts on the sheet under it */}
      <filter id="torn" x="-8%" y="-8%" width="116%" height="116%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={3} seed={2} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={9} result="d" />
        <feDropShadow in="d" dx={6} dy={9} stdDeviation={5} floodOpacity={0.35} />
      </filter>
      {/* a smaller tear for small pieces (eyes, mouths, buttons): edges rough but readable */}
      <filter id="tornS" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.16" numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={4} result="d" />
        <feDropShadow in="d" dx={2} dy={3} stdDeviation={1.6} floodOpacity={0.3} />
      </filter>
      {/* paper fibre on any piece */}
      <filter id="fibre">
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves={2} seed={9} result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0" result="a" />
        <feComposite in="a" in2="SourceGraphic" operator="in" result="b" />
        <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="b" /></feMerge>
      </filter>
    </defs>
  </svg>
);

/** The sheet: a wall of one paper and a floor of another, torn where they meet. */
export const CollageBg: React.FC<{ wall?: string; floor?: string; floorY?: number }> = ({ wall = P.teal, floor = P.rust, floorY = 1260 }) => (
  <AbsoluteFill>
    <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
      <rect width={1080} height={1920} fill={wall} filter="url(#fibre)" />
      <rect x={-30} y={floorY} width={1140} height={1920 - floorY + 40} fill={floor} filter="url(#torn)" />
    </svg>
  </AbsoluteFill>
);

/** A piece of paper arriving: drops in from a little above with a settle, like being placed on the sheet.
 *  Wrap any group with it. `at` is the frame it lands. */
export const Place: React.FC<{ at?: number; x?: number; y?: number; children: React.ReactNode; from?: "top" | "left" | "right" }> = ({ at = 0, x = 0, y = 0, children, from = "top" }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: f - at, fps, config: { damping: 11, mass: 0.6 } });
  if (f < at - 1) return null;
  const dx = from === "left" ? -120 * (1 - k) : from === "right" ? 120 * (1 - k) : 0;
  const dy = from === "top" ? -90 * (1 - k) : 0;
  return <g transform={`translate(${x + dx} ${y + dy}) rotate(${(1 - k) * -6})`} opacity={Math.min(1, k * 1.6)}>{children}</g>;
};

/** Milo in paper. (x, y) = the middle of his feet. s = scale (1 is about 560px tall).
 *  panic 0..1 widens his eyes and lifts his brows; talk = mouth open 0..1; bob = a little idle bounce. */
export const CMilo: React.FC<{ x: number; y: number; s?: number; panic?: number; talk?: number; tote?: boolean; flip?: boolean }> = ({ x, y, s = 1, panic = 0, talk = 0, tote = true, flip = false }) => {
  const f = useCurrentFrame();
  const blink = f % 96 < 4 ? 0.15 : 1;
  const bob = Math.sin(f / 9) * 3;
  const eye = 10 + panic * 6;
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${flip ? -s : s} ${s})`}>
      <g filter="url(#torn)">
        {/* legs + coat */}
        <rect x={-62} y={-200} width={44} height={200} fill={P.ink} />
        <rect x={18} y={-200} width={44} height={200} fill={P.ink} />
        <rect x={-95} y={-420} width={190} height={250} rx={34} fill={P.navy} />
        {/* head */}
        <circle cx={0} cy={-500} r={90} fill={P.skin} />
        {/* messy hair: torn spikes */}
        <path d="M-96 -520 l22 -74 l30 32 l22 -56 l32 44 l30 -46 l22 54 l28 -12 l-6 66 q-84 -42 -180 -8 z" fill={P.hair} />
        {/* the mustard scarf: a wrap and a long tail */}
        <path d="M-100 -420 q100 44 200 0 l0 46 q-100 44 -200 0 z" fill={P.mustard} />
        <rect x={42} y={-394} width={44} height={210} fill={P.mustard} />
        {tote && (
          <g>
            <rect x={86} y={-300} width={130} height={140} fill={P.kraft} />
            <rect x={104} y={-344} width={94} height={70} fill={P.white} transform="rotate(-6 150 -310)" />
            <rect x={118} y={-356} width={76} height={66} fill={P.cream} transform="rotate(8 156 -324)" />
          </g>
        )}
      </g>
      <g filter="url(#tornS)">
        <ellipse cx={-30} cy={-498} rx={eye * 0.9} ry={eye * blink} fill={P.hair} />
        <ellipse cx={30} cy={-498} rx={eye * 0.9} ry={eye * blink} fill={P.hair} />
        <rect x={-48} y={-536 - panic * 14} width={34} height={8} rx={4} fill={P.hair} transform={`rotate(${-8 - panic * 10} -31 ${-532 - panic * 14})`} />
        <rect x={14} y={-536 - panic * 14} width={34} height={8} rx={4} fill={P.hair} transform={`rotate(${8 + panic * 10} 31 ${-532 - panic * 14})`} />
        {talk > 0.05
          ? <ellipse cx={0} cy={-452} rx={16} ry={4 + talk * 12} fill="#5a1d14" />
          : <rect x={-20} y={-456} width={40} height={8} rx={4} fill={P.hair} transform={panic > 0.4 ? "rotate(-6 0 -452)" : undefined} />}
      </g>
    </g>
  );
};

/** Anyone else, in paper. dress/hair colours vary them; `long` gives long hair. (x, y) = middle of the feet. */
export const CPerson: React.FC<{ x: number; y: number; s?: number; dress?: string; hair?: string; skin?: string; long?: boolean; talk?: number }> = ({ x, y, s = 1, dress = P.red, hair = P.hair2, skin = P.skin, long = true, talk = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <g filter="url(#torn)">
      <path d="M-80 0 L0 -330 L80 0 Z" fill={dress} />
      {long && <path d="M-74 -420 q74 -110 148 0 v150 h-26 v-120 h-96 v120 h-26 z" fill={hair} />}
      <circle cx={0} cy={-400} r={64} fill={skin} />
      {!long && <path d="M-66 -420 q66 -80 132 0 l-8 -30 q-58 -50 -116 0 z" fill={hair} />}
      {long && <path d="M-70 -420 q70 -86 140 0 q-30 -30 -70 -26 q-40 -4 -70 26 z" fill={hair} />}
    </g>
    <g filter="url(#tornS)">
      <circle cx={-22} cy={-400} r={7} fill={P.hair} /><circle cx={22} cy={-400} r={7} fill={P.hair} />
      {talk > 0.05 ? <ellipse cx={0} cy={-368} rx={10} ry={3 + talk * 8} fill="#5a1d14" /> : <rect x={-12} y={-372} width={24} height={6} rx={3} fill={P.hair} />}
    </g>
  </g>
);

/** The hook on a torn cream card, Archivo Black, the key words in red. Big and there from frame 0 (it is the cover). */
export const CTitle: React.FC<{ text: string; accent?: string; y?: number; size?: number }> = ({ text, accent, y = 250, size = 74 }) => {
  const i = accent ? text.indexOf(accent) : -1;
  const lines = (i >= 0 ? [text.slice(0, i).trim(), accent!] : [text]).filter(Boolean);
  // fit the longest line inside the card (Archivo Black runs about 0.8 of the size per character, caps)
  const longest = Math.max(...lines.map((l) => l.length));
  size = Math.min(size, Math.floor(780 / (longest * 0.8)));
  const h = 70 + lines.length * size * 1.18;
  return (
    <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
      <rect x={110} y={y} width={860} height={h} fill={P.cream} filter="url(#torn)" />
      {lines.map((l, k) => (
        <text key={k} x={540} y={y + 35 + size * (k + 0.92) * 1.12} textAnchor="middle" fontFamily="ArchivoBlack" fontSize={size}
          fill={i >= 0 && k === lines.length - 1 ? P.red : P.ink}>{l.toUpperCase()}</text>
      ))}
    </svg>
  );
};

/** A handwritten scrap of paper (a thought, a line of a speech, a label). */
export const CNote: React.FC<{ text: string; x: number; y: number; rot?: number; size?: number; w?: number; at?: number }> = ({ text, x, y, rot = 4, size = 56, w, at = 0 }) => {
  const width = w ?? Math.max(220, text.length * size * 0.42 + 60);
  return (
    <Place at={at} x={x} y={y}>
      <g transform={`rotate(${rot})`}>
        <rect x={-width / 2} y={-size * 0.95} width={width} height={size * 1.6} fill={P.white} filter="url(#torn)" />
        <text x={0} y={size * 0.25} textAnchor="middle" fontFamily="Caveat" fontSize={size} fill={P.ink}>{text}</text>
      </g>
    </Place>
  );
};

/** A tiny eased helper for scenes. */
export const ease = (f: number, a: number, b: number) => Easing.inOut(Easing.cubic)(interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
