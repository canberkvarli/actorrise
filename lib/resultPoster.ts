/**
 * Whether a search result row shows a poster, and why that is not a tab question.
 *
 * `MonologueSpeech` gated the poster on the TAB it was rendered under:
 *
 *     const poster = mode === "film_tv" ? mono.poster_url : null;
 *
 * Cross-tab title recovery breaks that. Searching "game of thrones" on the
 * Plays tab deliberately crosses over and returns the TV rows (match_strategy
 * `title_cross_tab`) rather than an empty page. Those rows carry a real
 * `poster_url`, and the tab gate threw it away — so the one case where the
 * actor most needs to see "this is the TV show, not a play" rendered with no
 * poster at all.
 *
 * The row already knows what it is. Only film and TV rows have a
 * `film_tv_reference`, so only they ever carry a poster: of 14,339 visible
 * stage monologues, 0 have one, against 4,061 of 4,069 film and 991 of 1,313
 * TV. Reading the row instead of the tab needs no extra data and cannot
 * mislabel a play.
 */

export interface PosterRow {
  poster_url?: string | null;
  source_type?: string | null;
}

/** The poster to show for this row, or null when it has none. */
export function resultPoster(row: PosterRow): string | null {
  const url = (row.poster_url ?? "").trim();
  return url.length > 0 ? url : null;
}

/**
 * True when the row came from a different shelf than the tab being viewed.
 *
 * Cross-tab recovery is good behaviour that looks like a bug when it is
 * silent: the actor asked the Plays shelf for Game of Thrones and got results,
 * with nothing saying they are television. This is what lets the row say so.
 */
export function isCrossShelf(
  row: PosterRow,
  mode: "plays" | "film_tv" | undefined,
): boolean {
  const st = (row.source_type ?? "").trim().toLowerCase();
  if (!st || !mode) return false;
  const rowShelf = st === "play" ? "plays" : "film_tv";
  return rowShelf !== mode;
}

/** How to name the row's own medium in a one-word label. */
export function shelfLabel(row: PosterRow): string | null {
  const st = (row.source_type ?? "").trim().toLowerCase();
  if (st === "film") return "film";
  if (st === "tv") return "tv";
  if (st === "play") return "play";
  return null;
}
