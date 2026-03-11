/**
 * Frontend mirror of backend KeywordExtractor — extracts structured highlights
 * from a search query so result cards can emphasise matching tags.
 *
 * Pure string matching, no API call needed.
 */

export interface QueryHighlights {
  emotion?: string;
  gender?: string;
  age_range?: string;
  themes?: string[];
  tone?: string;
  category?: string;
}

const EMOTIONS: Record<string, string> = {
  sad: "sadness", depressed: "sadness", melancholy: "melancholy",
  blue: "sadness", unhappy: "sadness", tearful: "sadness",
  happy: "joy", funny: "joy", comedic: "joy", hilarious: "joy",
  joyful: "joy", cheerful: "joy", humorous: "joy", comic: "joy", witty: "joy",
  angry: "anger", furious: "anger", rage: "anger", mad: "anger",
  scared: "fear", fearful: "fear", anxious: "fear", afraid: "fear",
  terrified: "fear", nervous: "fear",
  hopeful: "hope", optimistic: "hope", confident: "hope",
  desperate: "despair", hopeless: "despair",
  longing: "longing", yearning: "longing", wistful: "longing",
  confused: "confusion", bewildered: "confusion",
  determined: "determination", resolute: "determination",
};

const GENDERS: Record<string, string> = {
  male: "male", man: "male", boy: "male", men: "male",
  female: "female", woman: "female", girl: "female", women: "female",
};

const AGE_RANGES: Record<string, string> = {
  teen: "teens", teenager: "teens", youth: "teens", young: "teens",
  "20s": "20s", twenties: "20s",
  "30s": "30s", thirties: "30s",
  "40s": "40s", forties: "40s", "middle aged": "40s",
  "50s": "50s", fifties: "50s", older: "50s",
  elderly: "60+", senior: "60+",
};

const THEMES: Record<string, string> = {
  love: "love", romance: "love", romantic: "love", passion: "love",
  death: "death", dying: "death", mortality: "death",
  power: "power", authority: "power", control: "power",
  betrayal: "betrayal", treachery: "betrayal",
  revenge: "revenge", vengeance: "revenge",
  family: "family", mother: "family", father: "family", parent: "family",
  identity: "identity", self: "identity", discovery: "identity",
  loss: "loss", grief: "loss", mourning: "loss",
  honor: "honor", duty: "honor", loyalty: "honor",
  freedom: "freedom", liberty: "freedom", independence: "freedom",
  madness: "madness", insanity: "madness",
  fate: "fate", destiny: "fate",
  jealousy: "jealousy", envy: "jealousy",
  ambition: "ambition",
  isolation: "isolation", loneliness: "isolation", solitude: "isolation",
  redemption: "redemption", forgiveness: "redemption",
};

const TONES: Record<string, string> = {
  funny: "comedic", comedic: "comedic", humorous: "comedic",
  sassy: "comedic", sarcastic: "comedic",
  serious: "dramatic", dramatic: "dramatic", tragic: "dramatic",
  intense: "dramatic", bold: "dramatic", fierce: "dramatic", powerful: "dramatic",
  dark: "dark", grim: "dark",
  romantic: "romantic", loving: "romantic",
  philosophical: "philosophical", contemplative: "contemplative",
  defiant: "defiant", rebellious: "defiant",
};

const CATEGORIES: Record<string, string> = {
  shakespeare: "classical", shakespearean: "classical",
  classical: "classical", greek: "classical", ancient: "classical",
  chekhov: "classical", ibsen: "classical", wilde: "classical",
  modern: "contemporary", contemporary: "contemporary",
};

function matchWord(words: string[], mapping: Record<string, string>): string | undefined {
  for (const w of words) {
    if (mapping[w]) return mapping[w];
  }
  // Try two-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (mapping[phrase]) return mapping[phrase];
  }
  return undefined;
}

function matchAllWords(words: string[], mapping: Record<string, string>): string[] {
  const results = new Set<string>();
  for (const w of words) {
    if (mapping[w]) results.add(mapping[w]);
  }
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (mapping[phrase]) results.add(mapping[phrase]);
  }
  return Array.from(results);
}

export function extractQueryHighlights(query: string): QueryHighlights {
  if (!query?.trim()) return {};

  const words = query.toLowerCase().replace(/[^a-z0-9+\s-]/g, "").split(/\s+/).filter(Boolean);
  const highlights: QueryHighlights = {};

  const emotion = matchWord(words, EMOTIONS);
  if (emotion) highlights.emotion = emotion;

  const gender = matchWord(words, GENDERS);
  if (gender) highlights.gender = gender;

  const age_range = matchWord(words, AGE_RANGES);
  if (age_range) highlights.age_range = age_range;

  const themes = matchAllWords(words, THEMES);
  if (themes.length > 0) highlights.themes = themes;

  const tone = matchWord(words, TONES);
  if (tone) highlights.tone = tone;

  const category = matchWord(words, CATEGORIES);
  if (category) highlights.category = category;

  return highlights;
}
