/**
 * Predefined genre options for scripts
 * Based on common theatrical and dramatic genres
 */

export const SCRIPT_GENRES = [
  "Drama",
  "Comedy",
  "Tragedy",
  "Musical",
  "Classical",
  "Contemporary",
  "Shakespeare",
  "Historical",
  "Romance",
  "Thriller",
  "Fantasy",
  "Absurdist",
  "Satire",
  "Farce",
  "Other",
] as const;

export type ScriptGenre = (typeof SCRIPT_GENRES)[number];
