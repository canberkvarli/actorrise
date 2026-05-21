/**
 * Genre → color scale for badges and left-border accents.
 * Same pattern as emotionColors.ts.
 */
const GENRE_BADGE_MAP: Record<string, string> = {
  drama: "bg-purple-500/10 text-purple-700 border-purple-300/40 dark:text-purple-400 dark:border-purple-500/30",
  comedy: "bg-emerald-500/10 text-emerald-700 border-emerald-300/40 dark:text-emerald-400 dark:border-emerald-500/30",
  tragedy: "bg-red-500/10 text-red-700 border-red-300/40 dark:text-red-400 dark:border-red-500/30",
  romance: "bg-rose-500/10 text-rose-700 border-rose-300/40 dark:text-rose-400 dark:border-rose-500/30",
  thriller: "bg-amber-500/10 text-amber-700 border-amber-300/40 dark:text-amber-400 dark:border-amber-500/30",
  musical: "bg-pink-500/10 text-pink-700 border-pink-300/40 dark:text-pink-400 dark:border-pink-500/30",
  classical: "bg-amber-600/10 text-amber-800 border-amber-400/40 dark:text-amber-500 dark:border-amber-600/30",
  shakespeare: "bg-amber-600/10 text-amber-800 border-amber-400/40 dark:text-amber-500 dark:border-amber-600/30",
  historical: "bg-amber-600/10 text-amber-800 border-amber-400/40 dark:text-amber-500 dark:border-amber-600/30",
  contemporary: "bg-teal-500/10 text-teal-700 border-teal-300/40 dark:text-teal-400 dark:border-teal-500/30",
  fantasy: "bg-indigo-500/10 text-indigo-700 border-indigo-300/40 dark:text-indigo-400 dark:border-indigo-500/30",
  absurdist: "bg-violet-500/10 text-violet-700 border-violet-300/40 dark:text-violet-400 dark:border-violet-500/30",
  satire: "bg-lime-500/10 text-lime-700 border-lime-300/40 dark:text-lime-400 dark:border-lime-500/30",
  farce: "bg-emerald-500/10 text-emerald-700 border-emerald-300/40 dark:text-emerald-400 dark:border-emerald-500/30",
};

const GENRE_BORDER_MAP: Record<string, string> = {
  drama: "border-l-purple-400/60",
  comedy: "border-l-emerald-400/60",
  tragedy: "border-l-red-400/60",
  romance: "border-l-rose-400/60",
  thriller: "border-l-amber-400/60",
  musical: "border-l-pink-400/60",
  classical: "border-l-amber-500/60",
  shakespeare: "border-l-amber-500/60",
  historical: "border-l-amber-500/60",
  contemporary: "border-l-teal-400/60",
  fantasy: "border-l-indigo-400/60",
  absurdist: "border-l-violet-400/60",
  satire: "border-l-lime-400/60",
  farce: "border-l-emerald-400/60",
};

export function getGenreBadgeClassName(genre: string): string {
  const key = genre.toLowerCase().trim();
  return GENRE_BADGE_MAP[key] ?? "bg-primary/10 text-primary border-primary/20";
}

export function getGenreBorderClassName(genre: string): string {
  const key = genre.toLowerCase().trim();
  return GENRE_BORDER_MAP[key] ?? "border-l-primary/40";
}
