import { Instrument_Serif, Bricolage_Grotesque, Courier_Prime } from "next/font/google";

/**
 * The Theatre Walk landing's own three faces.
 *
 * They live here rather than in `app/layout.tsx` on purpose. The layout's
 * fonts bind `--font-sans` / `--font-brand` for the entire app; these three
 * bind their own variables and are applied by adding `theatreFontVars` to one
 * wrapper on the landing page. Nothing else in the product restyles, and
 * `preload: false` keeps the files off every route that never names them.
 *
 * Instrument Serif ships a single weight (400) with a true italic — the italic
 * is load-bearing here, every headline has one, so `ital` must include 1.
 */
const instrumentSerif = Instrument_Serif({
  variable: "--font-theatre-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-theatre-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  /* The one face here that is preloaded. It sets every label in the landing
     nav, and `display: swap` means the pill is first measured in the fallback
     and then re-measured when the real file lands — which moves the CTA, and
     because the pill is centred, moves the logo with it. Preloading collapses
     that window. The display and Courier faces stay unpreloaded: neither is
     used for anything whose width decides a layout. */
  preload: true,
});

/** Stage directions only. Always italic, always lowercase, always in parens. */
const courierPrime = Courier_Prime({
  variable: "--font-theatre-direction",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

/** Drop onto the landing's outermost element, alongside `theatre`. */
export const theatreFontVars = [
  instrumentSerif.variable,
  bricolage.variable,
  courierPrime.variable,
].join(" ");
