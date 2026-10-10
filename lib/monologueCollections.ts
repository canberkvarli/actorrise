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
  /** Exact `plays.title` values. A play or show page lists every title it is stored under. */
  plays?: string[];
  /** `monologues.themes` tags; a piece with any of them qualifies. */
  themes?: string[];
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

  /* ------------------------------------------------------------------------
   * Added 2026-10-10. Google sessions fell a third in three weeks while the
   * signup rate held, so the fix is more pages for queries people type, not a
   * different funnel. Three kinds: one play or show (the public-domain plays
   * print in full, which nothing else ranking for "hamlet monologues" does),
   * one theme (the in-product search log's top asks: love, revenge, grief),
   * and the age and tone combinations the log keeps showing. Counts are from
   * the corpus on the day; the page reads live.
   * ---------------------------------------------------------------------- */
  {
    slug: "hamlet-monologues",
    title: "Hamlet Monologues: Every Speech, Printed in Full",
    h1: { em: "Hamlet", rest: "monologues, printed in full" },
    direction: "(the prince, and everyone around him.)",
    description:
      "Every monologue from Hamlet, printed in full: Hamlet, Claudius, Gertrude, Ophelia, Polonius and the rest, with running time and a free rehearsal for each.",
    intro:
      "Sixty-odd speeches from the play, not only the famous four. Hamlet's own are here, and so are the King's, Polonius giving advice, Horatio, the Ghost, the Players, Ophelia and the Queen. All public domain, all printed whole, each timed at a spoken pace.",
    query: "monologue from Hamlet",
    filters: { plays: ["Hamlet"] },
    related: ["macbeth-monologues", "king-lear-monologues", "othello-monologues"],
  },
  {
    slug: "macbeth-monologues",
    title: "Macbeth Monologues: Every Speech, Printed in Full",
    h1: { em: "Macbeth", rest: "monologues, printed in full" },
    direction: "(the Scottish play.)",
    description:
      "Every monologue from Macbeth, printed in full: Macbeth, Lady Macbeth, Malcolm, Lady Macduff, the Porter and the witches, with running time and a free rehearsal for each.",
    intro:
      "Twenty-one of Macbeth's own, Lady Macbeth's six, and the speeches nobody brings into a room because they never read past the famous ones: Malcolm, the Porter, Lady Macduff, Hecate. Public domain, printed whole, timed.",
    query: "monologue from Macbeth",
    filters: { plays: ["Macbeth"] },
    related: ["hamlet-monologues", "othello-monologues", "villain-monologues"],
  },
  {
    slug: "romeo-and-juliet-monologues",
    title: "Romeo and Juliet Monologues: Every Speech, Printed in Full",
    h1: { em: "Romeo and Juliet", rest: "monologues, printed in full" },
    direction: "(two households.)",
    description:
      "Every monologue from Romeo and Juliet, printed in full: Juliet, Romeo, Mercutio, the Nurse, Friar Laurence and the Prince, with running time for each.",
    intro:
      "Romeo's eight, Juliet's ten, the Friar's six, the Nurse, Mercutio, Capulet, Benvolio and the Prince. Written for young actors four hundred years ago and still the most asked-for classical audition pieces there are. Public domain, printed whole.",
    query: "monologue from Romeo and Juliet",
    filters: { plays: ["Romeo and Juliet"] },
    related: ["a-midsummer-nights-dream-monologues", "twelfth-night-monologues", "monologues-about-love"],
  },
  {
    slug: "othello-monologues",
    title: "Othello Monologues: Every Speech, Printed in Full",
    h1: { em: "Othello", rest: "monologues, printed in full" },
    direction: "(the handkerchief.)",
    description:
      "Every monologue from Othello, printed in full: Othello, Iago, Desdemona, Emilia and Cassio, with running time and a free rehearsal for each.",
    intro:
      "Iago has twenty-four speeches here, most of them to the audience. Othello's eleven, Desdemona's five, and Emilia's one on husbands, which wins more rooms than it gets credit for. Public domain, printed whole.",
    query: "monologue from Othello",
    filters: { plays: ["Othello"] },
    related: ["hamlet-monologues", "macbeth-monologues", "monologues-about-jealousy"],
  },
  {
    slug: "king-lear-monologues",
    title: "King Lear Monologues: Every Speech, Printed in Full",
    h1: { em: "King Lear", rest: "monologues, printed in full" },
    direction: "(the storm.)",
    description:
      "Every monologue from King Lear, printed in full: Lear, Edmund, Edgar, Gloucester, Kent, the Fool, Goneril, Regan and Cordelia, with running time for each.",
    intro:
      "Lear's eighteen, Edgar's eleven, Edmund's nine, Goneril, Kent, Gloucester, the Fool, Regan and Cordelia. The play has more standalone speeches than any other in the canon and most of them are never heard at an audition. Public domain, printed whole.",
    query: "monologue from King Lear",
    filters: { plays: ["King Lear"] },
    related: ["hamlet-monologues", "macbeth-monologues", "monologues-about-grief"],
  },
  {
    slug: "a-midsummer-nights-dream-monologues",
    title: "A Midsummer Night's Dream Monologues: Printed in Full",
    h1: { em: "A Midsummer Night's Dream", rest: "monologues, printed in full" },
    direction: "(the wood outside Athens.)",
    description:
      "Every monologue from A Midsummer Night's Dream, printed in full: Helena, Hermia, Puck, Oberon, Titania and Bottom, with running time and a free rehearsal for each.",
    intro:
      "Helena's six, Theseus's seven, Oberon, Titania, Puck and Bottom. The comedy most schools stage first and the one with the most usable short speeches for young actors. Public domain, printed whole.",
    query: "monologue from A Midsummer Night's Dream",
    filters: { plays: ["A Midsummer Night's Dream"] },
    related: ["twelfth-night-monologues", "much-ado-about-nothing-monologues", "comedic-monologues-for-teens"],
  },
  {
    slug: "twelfth-night-monologues",
    title: "Twelfth Night Monologues: Every Speech, Printed in Full",
    h1: { em: "Twelfth Night", rest: "monologues, printed in full" },
    direction: "(or what you will.)",
    description:
      "Every monologue from Twelfth Night, printed in full: Viola, Olivia, Malvolio, the Duke, Sebastian, Maria and the Clown, with running time and a free rehearsal for each.",
    intro:
      "Viola, Malvolio with the letter, Olivia falling for the wrong twin, the Duke on music and the Clown on everything. Some of the best comic monologues in Shakespeare for women, and the one play where the fool gets the last word.",
    query: "monologue from Twelfth Night",
    filters: { plays: ["Twelfth Night"] },
    related: ["a-midsummer-nights-dream-monologues", "much-ado-about-nothing-monologues", "classical-monologues-for-women"],
  },
  {
    slug: "much-ado-about-nothing-monologues",
    title: "Much Ado About Nothing Monologues: Printed in Full",
    h1: { em: "Much Ado About Nothing", rest: "monologues, printed in full" },
    direction: "(Messina.)",
    description:
      "Every monologue from Much Ado About Nothing, printed in full: Beatrice, Benedick, Hero, Claudio, Leonato and Don John, with running time and a free rehearsal for each.",
    intro:
      "Benedick's eight, Beatrice's five, Dogberry's six, Leonato at the wedding, Don Pedro, Borachio and Don John. Shakespeare's sharpest comic speeches, and a few that are not comic at all. Public domain, printed whole.",
    query: "monologue from Much Ado About Nothing",
    filters: { plays: ["Much Ado About Nothing"] },
    related: ["twelfth-night-monologues", "a-midsummer-nights-dream-monologues", "comedic-monologues-for-women-under-2-minutes"],
  },
  {
    slug: "a-dolls-house-monologues",
    title: "A Doll's House Monologues: Nora, Torvald and Krogstad",
    h1: { em: "A Doll's House", rest: "monologues, printed in full" },
    direction: "(the door.)",
    description:
      "Every monologue from Ibsen's A Doll's House, printed in full: Nora, Torvald Helmer and Krogstad, with running time and a free rehearsal for each.",
    intro:
      "Nora's last scene is the most requested modern classical piece for women, and it is here whole, along with everything leading up to it: Helmer's fifteen speeches, Krogstad's three. The translation is public domain, so every speech prints in full.",
    query: "monologue from A Doll's House",
    filters: { plays: ["A Doll's House"] },
    related: ["classical-monologues-for-women", "medea-monologues", "hamlet-monologues"],
  },
  {
    slug: "julius-caesar-monologues",
    title: "Julius Caesar Monologues: Brutus, Antony, Cassius and Portia",
    h1: { em: "Julius Caesar", rest: "monologues, printed in full" },
    direction: "(the ides of March.)",
    description:
      "Every monologue from Julius Caesar, printed in full: Brutus, Cassius, Antony, Portia, Casca and Caesar, with running time and a free rehearsal for each.",
    intro:
      "Antony over the body, Brutus in the orchard, Cassius on the Tiber, Portia asking to be told. Forty-four speeches from the play with the best political rhetoric in the language, public domain, printed whole and timed.",
    query: "monologue from Julius Caesar",
    filters: { plays: ["Julius Caesar"] },
    related: ["hamlet-monologues", "king-lear-monologues", "monologues-about-revenge"],
  },
  {
    slug: "medea-monologues",
    title: "Medea Monologues: Every Speech, Printed in Full",
    h1: { em: "Medea", rest: "monologues, printed in full" },
    direction: "(Corinth.)",
    description:
      "Every monologue from Euripides' Medea, printed in full: Medea, Jason, Creon, the Nurse and the Messenger, with running time and a free rehearsal for each.",
    intro:
      "Medea's twenty-two speeches, Jason's ten, the Nurse, Creon, Aegeus and the Messenger. The play that gives a woman the whole stage and dares the room to look away. Public domain, printed whole.",
    query: "monologue from Medea",
    filters: { plays: ["Medea"] },
    related: ["a-dolls-house-monologues", "monologues-about-revenge", "classical-monologues-for-women"],
  },
  {
    slug: "euphoria-monologues",
    title: "Euphoria Monologues: Rue, Jules, Ali, Maddy, Nate and Cal",
    h1: { em: "Euphoria", rest: "monologues, by character" },
    direction: "(east highland.)",
    description:
      "Monologues from Euphoria by character: Rue, Jules, Ali, Maddy, Cal, Nate and Leslie, with tone and running time for each. One of the most searched-for shows on ActorRise.",
    intro:
      "Rue's ten, Jules's eight, Ali's eleven, and Maddy, Cal, Nate and Leslie beside them. Euphoria is one of the most searched-for shows on ActorRise and these are the speeches people come for, listed by character. The text is copyrighted, so each entry names the piece and the search opens the rest.",
    query: "monologue from Euphoria",
    filters: { plays: ["Euphoria"] },
    related: ["yellowjackets-monologues", "contemporary-monologues-for-teens", "dramatic-monologues-for-teens"],
  },
  {
    slug: "yellowjackets-monologues",
    title: "Yellowjackets Monologues: Shauna, Misty, Natalie and Jackie",
    h1: { em: "Yellowjackets", rest: "monologues, by character" },
    direction: "(the wilderness.)",
    description:
      "Monologues from Yellowjackets by character: Shauna, Misty, Natalie, Jackie and Coach Ben, with tone and running time for each.",
    intro:
      "Shauna is the one people search for, and she is here, with Misty, Natalie, Jackie and Coach Ben beside her. The show is copyrighted, so each entry names the character, the piece and the length, and the search opens the rest.",
    query: "monologue from Yellowjackets",
    filters: { plays: ["Yellowjackets"] },
    related: ["euphoria-monologues", "contemporary-dramatic-monologues-for-women", "dramatic-monologues-for-teens"],
  },
  {
    slug: "monologues-about-love",
    title: "Monologues About Love",
    h1: { em: "Monologues", rest: "about love" },
    direction: "(the oldest subject.)",
    description:
      "Monologues about love from plays, film and television, classical and contemporary, for women and men. Character, source, author and running time for each, with public-domain text in full.",
    intro:
      "Falling into it, being refused it, losing it, pretending not to want it. Four thousand pieces in the library are tagged with love; these are the thirty that read best on their own, the public-domain ones printed whole.",
    query: "monologue about love",
    filters: { themes: ["love"] },
    related: ["romeo-and-juliet-monologues", "monologues-about-jealousy", "much-ado-about-nothing-monologues"],
  },
  {
    slug: "monologues-about-revenge",
    title: "Monologues About Revenge",
    h1: { em: "Monologues", rest: "about revenge" },
    direction: "(served cold.)",
    description:
      "Monologues about revenge from plays, film and television, for women and men. Character, source, author and running time for each, with public-domain text printed in full.",
    intro:
      "The speech where someone decides what they are going to do about it. Thirteen hundred pieces in the library are tagged with revenge, classical and modern; the thirty below are the ones that read best on their own, the public-domain ones printed whole.",
    query: "monologue about revenge",
    filters: { themes: ["revenge"] },
    related: ["medea-monologues", "villain-monologues", "monologues-about-jealousy"],
  },
  {
    slug: "monologues-about-jealousy",
    title: "Monologues About Jealousy",
    h1: { em: "Monologues", rest: "about jealousy" },
    direction: "(the green-eyed monster.)",
    description:
      "Monologues about jealousy from plays, film and television, for women and men. Character, source, author and running time for each, with public-domain text printed in full.",
    intro:
      "Six hundred pieces in the library are tagged with jealousy and most of them are not Shakespeare. Suspicion, envy, the friend who got the part. The thirty below read best on their own; the public-domain ones print whole.",
    query: "monologue about jealousy",
    filters: { themes: ["jealousy"] },
    related: ["othello-monologues", "monologues-about-love", "monologues-about-revenge"],
  },
  {
    slug: "monologues-about-grief",
    title: "Monologues About Grief and Loss",
    h1: { em: "Monologues", rest: "about grief and loss" },
    direction: "(what is left.)",
    description:
      "Monologues about grief and loss from plays, film and television, for women and men. Character, source, author and running time for each, with public-domain text printed in full.",
    intro:
      "A death, a leaving, the thing that cannot be got back. The hardest pieces to do well and the ones most often asked for in a dramatic slot. Tagged grief or loss in the library; the public-domain ones print in full.",
    query: "monologue about grief",
    filters: { themes: ["grief", "loss"] },
    related: ["king-lear-monologues", "dramatic-monologues-for-women-under-2-minutes", "dramatic-monologues-for-men-under-2-minutes"],
  },
  {
    slug: "comedic-monologues-for-teens",
    title: "Comedic Monologues for Teens",
    h1: { em: "Comedic", rest: "monologues for teens" },
    direction: "(funny, and your age.)",
    description:
      "Comedic monologues written for teenage characters, from plays, film and television. Character, source, author and running time for each, with public-domain text in full.",
    intro:
      "Funny pieces for teenage characters, which is the shelf every drama teacher and every fifteen-year-old with an audition on Friday is looking for. Classical and contemporary both; the public-domain ones print whole.",
    query: "comedic monologue for a teenager",
    filters: { tones: COMEDIC, ages: ["teens"] },
    related: ["dramatic-monologues-for-teens", "contemporary-monologues-for-teens", "a-midsummer-nights-dream-monologues"],
  },
  {
    slug: "dramatic-monologues-for-teens",
    title: "Dramatic Monologues for Teens",
    h1: { em: "Dramatic", rest: "monologues for teens" },
    direction: "(serious, and your age.)",
    description:
      "Dramatic monologues written for teenage characters, from plays, film and television. Character, source, author and running time for each, with public-domain text in full.",
    intro:
      "Serious pieces for teenage characters, written at that age rather than cut down from an adult's speech. Over two hundred in the library; these are the ones that read best alone, the public-domain ones printed in full.",
    query: "dramatic monologue for a teenager",
    filters: { tones: DRAMATIC, ages: ["teens"] },
    related: ["comedic-monologues-for-teens", "contemporary-monologues-for-teens", "euphoria-monologues"],
  },
  {
    slug: "villain-monologues",
    title: "Villain Monologues",
    h1: { em: "Villain", rest: "monologues" },
    direction: "(the best lines.)",
    description:
      "Villain monologues from plays, film and television: Iago, Richard III, Edmund and their modern heirs. Character, source, author and running time for each, with public-domain text in full.",
    intro:
      "The villain gets the best speeches and knows it. Iago, Richard and Edmund set the pattern; the film and television villains below learned from them. Dark by tone, from every era, listed by how well they stand alone.",
    query: "villain monologue",
    filters: { tones: ["dark"] },
    related: ["othello-monologues", "macbeth-monologues", "monologues-about-revenge"],
  },
];

export function findCollection(slug: string): Collection | null {
  return COLLECTIONS.find((c) => c.slug === slug) ?? null;
}
