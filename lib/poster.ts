/**
 * Poster URLs come from OMDb as `..._V1_SX300.jpg`, which is a 300px-wide
 * image — fine for a thumbnail, mush at any real size. Amazon's media host
 * accepts a transform in that suffix, and the same asset comes back sharp:
 *
 *   ._V1_SX300.jpg          → 300 x 460     (what we store)
 *   ._V1_FMjpg_UX1000_.jpg  → 1000 x 1532   (~124-280 KB)
 *
 * Verified 2026-09-05 against four randomly-sampled rows: 4/4 upscaled
 * cleanly. All 1,583 posters in film_tv_references are m.media-amazon.com
 * URLs carrying the `._V1_` marker, so this applies to the whole corpus —
 * there is no non-Amazon poster to fall through.
 *
 * Nothing is rewritten in the database. The stored URL stays the canonical
 * record and this runs at render time, so a bad transform degrades to a
 * missing image rather than a corrupted row.
 */

/** Widths Amazon actually honours. UX is "upscale to width". */
export type PosterWidth = 300 | 400 | 600 | 800 | 1000;

/**
 * Ask for the poster at a given width. Returns the input untouched when the
 * URL is not an Amazon `._V1_` asset, so a future non-OMDb source still renders.
 */
export function posterAt(url: string | null | undefined, width: PosterWidth = 600): string | null {
  if (!url) return null;
  // Everything after `._V1_` is the transform chain. Anchored to the end and
  // barred from crossing a `/` so it cannot chew through a path segment.
  if (!/\._V1_[^/]*$/.test(url)) return url;
  return url.replace(/\._V1_[^/]*$/, `._V1_FMjpg_UX${width}_.jpg`);
}

/**
 * How often a room will hear this piece today.
 *
 * `overdone_score` is 0 for 12,196 monologues, and that zero means "never
 * scored", not "never performed" — the AI pass covered the classical corpus
 * and has not reached the rest. Reading it as freshness would print a
 * confident claim about three-quarters of the library on no evidence, so an
 * unscored piece gets no badge at all.
 *
 * The four words are the corpus's own vocabulary from that scoring pass.
 */
export type OverdoneBand = {
  label: "Fresh" | "Recognizable" | "Common" | "Warhorse";
  /** Rising heat: 0 = rarely heard, 3 = everyone brings this. */
  level: 0 | 1 | 2 | 3;
};

export function overdoneBand(score: number | null | undefined): OverdoneBand | null {
  if (score == null || score <= 0) return null;
  if (score <= 0.3) return { label: "Fresh", level: 0 };
  if (score <= 0.6) return { label: "Recognizable", level: 1 };
  if (score <= 0.8) return { label: "Common", level: 2 };
  return { label: "Warhorse", level: 3 };
}
