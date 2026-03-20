/**
 * Emotion → color scale for badges and UI.
 * 4 semantic groups: warm (anger/fear), cool (sadness/melancholy),
 * positive (joy/hope/love), neutral (everything else).
 * Subtler palette with border-transparent for a calmer look.
 */
const WARM = "bg-red-500/8 text-red-700 border-transparent dark:text-red-400";
const COOL = "bg-violet-500/8 text-violet-700 border-transparent dark:text-violet-400";
const POSITIVE = "bg-emerald-500/8 text-emerald-700 border-transparent dark:text-emerald-400";
const NEUTRAL = "bg-muted/60 text-muted-foreground border-transparent";

const EMOTION_COLOR_MAP: Record<string, string> = {
  // Warm: anger, fear, intensity
  anger: WARM, rage: WARM, fury: WARM, frustration: WARM,
  fear: WARM, anxiety: WARM,
  // Cool: sadness, melancholy, heaviness
  sadness: COOL, grief: COOL, despair: COOL, melancholy: COOL,
  drama: COOL, tension: COOL,
  // Positive: joy, hope, excitement, love
  joy: POSITIVE, happiness: POSITIVE, hope: POSITIVE,
  excitement: POSITIVE, love: POSITIVE,
};

export function getEmotionBadgeClassName(emotion: string): string {
  const key = emotion.toLowerCase().trim();
  return EMOTION_COLOR_MAP[key] ?? NEUTRAL;
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
