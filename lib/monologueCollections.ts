/**
 * Keyword collection pages under /monologues/<slug>.
 *
 * The earlier landing pages (comedic-woman-under-2-minutes and friends) are a
 * hero and a button. Google has nothing to rank, so the gender × tone × length
 * queries go to Monologue Genie and Monologue Blogger. These are the same URLs
 * shape with the actual list on the page: real pieces from the corpus, filtered
 * the way the query reads, each linking to its own indexed monologue page.
 *
 * Adding a page is adding an entry here. The [slug] route, the sitemap and the
 * related links all read this list. Keep slugs distinct from the hand-written
 * folders next to the route (a static folder wins over [slug], silently).
 *
 * Filter values match the corpus as of 2026-09-07:
 *   character_gender: male | female | any
 *   tone: anguished defiant dramatic contemplative comedic dark philosophical
 *         sarcastic inspirational melancholic romantic joyful
 *   plays.category: classical | contemporary
 *   character_age_range: teens 20s 30s 40s 50s 60+ (plus a few ranges)
 */

export type CollectionFilters = {
  gender?: "female" | "male";
  tones?: string[];
  era?: "classical" | "contemporary";
  maxSeconds?: number;
  ages?: string[];
  sources?: ("play" | "film" | "tv")[];
};

export type Collection = {
  slug: string;
  /** Browser tab / search result title (root layout appends " | ActorRise"). */
  title: string;
  /** H1 split so the leading word can carry the italic accent. */
  h1: { em: string; rest: string };
  /** Typewriter eyebrow, parentheses included. */
  direction: string;
  description: string;
  intro: string;
  /** The natural-language query the "search" button submits. */
  query: string;
  filters: CollectionFilters;
  related: string[];
};

const DRAMATIC = ["dramatic", "anguished", "dark"];
const COMEDIC = ["comedic", "sarcastic", "joyful"];

export const COLLECTIONS: Collection[] = [
  {
    slug: "comedic-monologues-for-women-under-2-minutes",
    title: "Comedic Monologues for Women Under 2 Minutes",
    h1: { em: "Comedic", rest: "monologues for women, under two minutes" },
    direction: "(quick comedy.)",
    description:
      "Short comedic monologues for women, all under two minutes, with character, play, author and running time. Read the public-domain ones in full.",
    intro:
      "The audition ask that never changes: funny, female, and done before the timer. Every piece below runs under two minutes. The classical ones are public domain and printed in full.",
    query: "comedic monologue for a woman under 2 minutes",
    filters: { gender: "female", tones: COMEDIC, maxSeconds: 120 },
    related: ["dramatic-monologues-for-women-under-2-minutes", "one-minute-monologues-for-women", "contemporary-comedic-monologues-for-women"],
  },
  {
    slug: "dramatic-monologues-for-women-under-2-minutes",
    title: "Dramatic Monologues for Women Under 2 Minutes",
    h1: { em: "Dramatic", rest: "monologues for women, under two minutes" },
    direction: "(hold the room.)",
    description:
      "Dramatic monologues for women that run under two minutes. Character, source, author and length for each, with full text where the play is public domain.",
    intro:
      "A dramatic piece that lands inside two minutes is harder to find than a long one. These do. Sorted by how well they read on their own, not by fame.",
    query: "dramatic monologue for a woman under 2 minutes",
    filters: { gender: "female", tones: DRAMATIC, maxSeconds: 120 },
    related: ["comedic-monologues-for-women-under-2-minutes", "contemporary-dramatic-monologues-for-women", "classical-monologues-for-women"],
  },
  {
    slug: "comedic-monologues-for-men-under-2-minutes",
    title: "Comedic Monologues for Men Under 2 Minutes",
    h1: { em: "Comedic", rest: "monologues for men, under two minutes" },
    direction: "(quick comedy.)",
    description:
      "Short comedic monologues for men, under two minutes each, with character, play, author and running time. Public-domain pieces printed in full.",
    intro:
      "Funny, male, and short. Every piece here runs under two minutes, so you can read it once and know whether it is yours.",
    query: "comedic monologue for a man under 2 minutes",
    filters: { gender: "male", tones: COMEDIC, maxSeconds: 120 },
    related: ["dramatic-monologues-for-men-under-2-minutes", "one-minute-monologues-for-men", "contemporary-dramatic-monologues-for-men"],
  },
  {
    slug: "dramatic-monologues-for-men-under-2-minutes",
    title: "Dramatic Monologues for Men Under 2 Minutes",
    h1: { em: "Dramatic", rest: "monologues for men, under two minutes" },
    direction: "(hold the room.)",
    description:
      "Dramatic monologues for men that run under two minutes. Character, source, author and length for each, with full text where the play is public domain.",
    intro:
      "Two minutes is enough to turn a room if the piece is built for it. These are. Length is estimated at a spoken pace, so trust it within ten seconds either way.",
    query: "dramatic monologue for a man under 2 minutes",
    filters: { gender: "male", tones: DRAMATIC, maxSeconds: 120 },
    related: ["comedic-monologues-for-men-under-2-minutes", "contemporary-dramatic-monologues-for-men", "one-minute-monologues-for-men"],
  },
  {
    slug: "one-minute-monologues-for-women",
    title: "One-Minute Monologues for Women",
    h1: { em: "One-minute", rest: "monologues for women" },
    direction: "(sixty seconds.)",
    description:
      "Monologues for women that run about a minute or less. Character, play, author and running time for each, with public-domain text in full.",
    intro:
      "For the sixty-second slot: a general, a showcase, a self-tape that asks for one minute and means it. Everything here finishes inside it.",
    query: "one minute monologue for a woman",
    filters: { gender: "female", maxSeconds: 65 },
    related: ["comedic-monologues-for-women-under-2-minutes", "dramatic-monologues-for-women-under-2-minutes", "one-minute-monologues-for-men"],
  },
  {
    slug: "one-minute-monologues-for-men",
    title: "One-Minute Monologues for Men",
    h1: { em: "One-minute", rest: "monologues for men" },
    direction: "(sixty seconds.)",
    description:
      "Monologues for men that run about a minute or less. Character, play, author and running time for each, with public-domain text in full.",
    intro:
      "Short is a skill. These pieces make their point and get out inside a minute, which is exactly what a one-minute slot wants from you.",
    query: "one minute monologue for a man",
    filters: { gender: "male", maxSeconds: 65 },
    related: ["comedic-monologues-for-men-under-2-minutes", "dramatic-monologues-for-men-under-2-minutes", "one-minute-monologues-for-women"],
  },
  {
    slug: "contemporary-monologues-for-teens",
    title: "Contemporary Monologues for Teens",
    h1: { em: "Contemporary", rest: "monologues for teens" },
    direction: "(your age, your voice.)",
    description:
      "Contemporary monologues written for teenage characters, from plays, film and television. Character, source, author and running time for each.",
    intro:
      "Teenage characters written by living writers, not a thirty-year-old's speech with the age crossed out. Most of these sources are copyrighted, so the page lists the piece and where it lives.",
    query: "contemporary monologue for a teenager",
    filters: { era: "contemporary", ages: ["teens"] },
    related: ["comedic-monologues-for-women-under-2-minutes", "comedic-monologues-for-men-under-2-minutes", "one-minute-monologues-for-women"],
  },
  {
    slug: "classical-monologues-for-women",
    title: "Classical Monologues for Women",
    h1: { em: "Classical", rest: "monologues for women" },
    direction: "(the old words.)",
    description:
      "Classical monologues for women from public-domain plays, printed in full. Character, play, author and running time for each.",
    intro:
      "Shakespeare, the Greeks, Restoration comedy, Ibsen, Chekhov and the writers around them. All public domain, all printed in full, so you can read the whole speech before you decide.",
    query: "classical monologue for a woman",
    filters: { gender: "female", era: "classical" },
    related: ["dramatic-monologues-for-women-under-2-minutes", "monologues-for-women-over-40", "contemporary-dramatic-monologues-for-women"],
  },
  {
    slug: "contemporary-dramatic-monologues-for-women",
    title: "Contemporary Dramatic Monologues for Women",
    h1: { em: "Contemporary", rest: "dramatic monologues for women" },
    direction: "(now, and serious.)",
    description:
      "Contemporary dramatic monologues for women from modern plays, film and television. Character, source, author and running time for each.",
    intro:
      "Serious pieces for women from the last few decades. The sources are mostly copyrighted, so each entry tells you the character, the work and the length, and the search opens the rest.",
    query: "contemporary dramatic monologue for a woman",
    filters: { gender: "female", tones: DRAMATIC, era: "contemporary" },
    related: ["dramatic-monologues-for-women-under-2-minutes", "contemporary-comedic-monologues-for-women", "classical-monologues-for-women"],
  },
  {
    slug: "contemporary-dramatic-monologues-for-men",
    title: "Contemporary Dramatic Monologues for Men",
    h1: { em: "Contemporary", rest: "dramatic monologues for men" },
    direction: "(now, and serious.)",
    description:
      "Contemporary dramatic monologues for men from modern plays, film and television. Character, source, author and running time for each.",
    intro:
      "Serious pieces for men from the last few decades, listed by character, work and length. Most are copyrighted, so the text lives with the rights holder and the search opens the rest.",
    query: "contemporary dramatic monologue for a man",
    filters: { gender: "male", tones: DRAMATIC, era: "contemporary" },
    related: ["dramatic-monologues-for-men-under-2-minutes", "comedic-monologues-for-men-under-2-minutes", "one-minute-monologues-for-men"],
  },
  {
    slug: "contemporary-comedic-monologues-for-women",
    title: "Contemporary Comedic Monologues for Women",
    h1: { em: "Contemporary", rest: "comedic monologues for women" },
    direction: "(now, and funny.)",
    description:
      "Contemporary comedic monologues for women from modern plays, film and television. Character, source, author and running time for each.",
    intro:
      "Funny and recent. This is the thinnest shelf in the corpus, which is also why it is the hardest search to satisfy anywhere else. Each entry names the character, the work and the length.",
    query: "contemporary comedic monologue for a woman",
    filters: { gender: "female", tones: COMEDIC, era: "contemporary" },
    related: ["comedic-monologues-for-women-under-2-minutes", "contemporary-dramatic-monologues-for-women", "contemporary-monologues-for-teens"],
  },
  {
    slug: "monologues-for-women-over-40",
    title: "Monologues for Women Over 40",
    h1: { em: "Monologues", rest: "for women over 40" },
    direction: "(a life behind the lines.)",
    description:
      "Monologues written for women in their forties, fifties and beyond, from plays, film and television. Character, source, author and running time for each.",
    intro:
      "Characters with a past. Written for women in their forties and up, across classical and contemporary sources, so the age is in the text and not only in the casting note.",
    query: "monologue for a woman over 40",
    filters: { gender: "female", ages: ["40s", "50s", "60+"] },
    related: ["classical-monologues-for-women", "contemporary-dramatic-monologues-for-women", "dramatic-monologues-for-women-under-2-minutes"],
  },
];

export function findCollection(slug: string): Collection | null {
  return COLLECTIONS.find((c) => c.slug === slug) ?? null;
}
