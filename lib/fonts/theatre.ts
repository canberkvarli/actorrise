import localFont from "next/font/local";

/**
 * The Theatre Walk landing's own three faces.
 *
 * They live here rather than in `app/layout.tsx` on purpose. The layout's
 * fonts bind `--font-sans` / `--font-brand` for the entire app; these three
 * bind their own variables and are applied by adding `theatreFontVars` to one
 * wrapper on the landing page. Nothing else in the product restyles, and
 * `preload: false` keeps the files off every route that never names them.
 *
 * The files are in `./files`, latin subset, taken from Google Fonts on
 * 2026-10-06 (see `lib/fonts/files/README.md`). They used to come from
 * `next/font/google`, which downloads from Google at build time; the build
 * box could not reach it on 2026-10-03 and again on 2026-10-06 and the deploy
 * failed both times. Nothing here depends on the network any more.
 *
 * Instrument Serif ships a single weight (400) with a true italic — the italic
 * is load-bearing here, every headline has one, so both files are listed.
 */
const instrumentSerif = localFont({
  variable: "--font-theatre-display",
  src: [
    { path: "./files/instrument-serif-normal-400.woff2", weight: "400", style: "normal" },
    { path: "./files/instrument-serif-italic-400.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

const bricolage = localFont({
  variable: "--font-theatre-body",
  /* One variable file: weight 200 to 800, width and optical size axes too. */
  src: [{ path: "./files/bricolage-grotesque-normal-200-800.woff2", weight: "200 800", style: "normal" }],
  display: "swap",
  /* The one face here that is preloaded. It sets every label in the landing
     nav, and `display: swap` means the pill is first measured in the fallback
     and then re-measured when the real file lands — which moves the CTA, and
     because the pill is centred, moves the logo with it. Preloading collapses
     that window. The display and Courier faces stay unpreloaded: neither is
     used for anything whose width decides a layout. */
  preload: true,
});

/** Stage directions only. Always italic, always lowercase, always in parens.
 *  Also the monologue text's typewriter face (`--font-typewriter` in globals.css). */
const courierPrime = localFont({
  variable: "--font-theatre-direction",
  src: [
    { path: "./files/courier-prime-normal-400.woff2", weight: "400", style: "normal" },
    { path: "./files/courier-prime-normal-700.woff2", weight: "700", style: "normal" },
    { path: "./files/courier-prime-italic-400.woff2", weight: "400", style: "italic" },
    { path: "./files/courier-prime-italic-700.woff2", weight: "700", style: "italic" },
  ],
  display: "swap",
  preload: false,
});

/** On `<body>`, so `--font-typewriter` (the monologue text) resolves on every
 *  route. Until 2026-10-06 `components/FontLoader` fetched Courier Prime from
 *  Google at runtime for this; the same four files now serve both uses. */
export const typewriterFontVar = courierPrime.variable;

/** Drop onto the landing's outermost element, alongside `theatre`. */
export const theatreFontVars = [
  instrumentSerif.variable,
  bricolage.variable,
  courierPrime.variable,
].join(" ");
