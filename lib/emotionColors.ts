/**
 * Emotion → color scale for badges and UI.
 * Negative/angry → red; frustration/drama → purple; positive/joy → blue–green.
 */
const EMOTION_COLOR_MAP: Record<string, string> = {
  // Angry / intense (red)
  anger: "bg-red-500/10 text-red-700 border-red-300/40 dark:text-red-400 dark:border-red-500/30",
  rage: "bg-red-500/10 text-red-700 border-red-300/40 dark:text-red-400 dark:border-red-500/30",
  fury: "bg-red-500/10 text-red-700 border-red-300/40 dark:text-red-400 dark:border-red-500/30",
  frustration: "bg-red-500/10 text-red-700 border-red-300/40 dark:text-red-400 dark:border-red-500/30",
  fear: "bg-red-600/10 text-red-800 border-red-400/40 dark:text-red-500 dark:border-red-600/30",
  anxiety: "bg-red-600/10 text-red-800 border-red-400/40 dark:text-red-500 dark:border-red-600/30",
  // Sad / heavy (purple–slate)
  sadness: "bg-violet-500/10 text-violet-700 border-violet-300/40 dark:text-violet-400 dark:border-violet-500/30",
  grief: "bg-violet-500/10 text-violet-700 border-violet-300/40 dark:text-violet-400 dark:border-violet-500/30",
  despair: "bg-violet-600/10 text-violet-800 border-violet-400/40 dark:text-violet-500 dark:border-violet-600/30",
  melancholy: "bg-violet-500/10 text-violet-700 border-violet-300/40 dark:text-violet-400 dark:border-violet-500/30",
  drama: "bg-purple-500/10 text-purple-700 border-purple-300/40 dark:text-purple-400 dark:border-purple-500/30",
  tension: "bg-purple-500/10 text-purple-700 border-purple-300/40 dark:text-purple-400 dark:border-purple-500/30",
  // Positive / hopeful (green–teal–blue)
  joy: "bg-emerald-500/10 text-emerald-700 border-emerald-300/40 dark:text-emerald-400 dark:border-emerald-500/30",
  happiness: "bg-emerald-500/10 text-emerald-700 border-emerald-300/40 dark:text-emerald-400 dark:border-emerald-500/30",
  hope: "bg-sky-500/10 text-sky-700 border-sky-300/40 dark:text-sky-400 dark:border-sky-500/30",
  excitement: "bg-teal-500/10 text-teal-700 border-teal-300/40 dark:text-teal-400 dark:border-teal-500/30",
  love: "bg-rose-500/10 text-rose-700 border-rose-300/40 dark:text-rose-400 dark:border-rose-500/30",
};

export function getEmotionBadgeClassName(emotion: string): string {
  const key = emotion.toLowerCase().trim();
  return EMOTION_COLOR_MAP[key] ?? "bg-primary/10 text-primary border-primary/20";
}

const EMOTION_BAR_COLOR: Record<string, string> = {
  anger: "bg-red-500", rage: "bg-red-500", fury: "bg-red-500", frustration: "bg-red-500",
  fear: "bg-red-500", anxiety: "bg-red-500",
  sadness: "bg-violet-500", grief: "bg-violet-500", despair: "bg-violet-500", melancholy: "bg-violet-500",
  drama: "bg-purple-500", tension: "bg-purple-500",
  joy: "bg-emerald-500", happiness: "bg-emerald-500", hope: "bg-sky-500", excitement: "bg-teal-500", love: "bg-rose-500",
};

/** For emotion score bars (e.g. in detail view): same scale, bar color */
export function getEmotionBarClassName(emotion: string): string {
  const key = emotion.toLowerCase().trim();
  return EMOTION_BAR_COLOR[key] ?? "bg-primary";
}
