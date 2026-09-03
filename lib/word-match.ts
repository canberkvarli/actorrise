/**
 * Word matching for rehearsal — deciding whether the actor said the word on the page.
 *
 * This replaces a soundex-based matcher that failed in three specific ways, all of
 * which an actor experiences as "it doesn't hear me":
 *
 *   1. Hyphenated words were stripped to a single token, so the line "Twenty-four."
 *      became `twentyfour` and could never match the `twenty four` a microphone hears.
 *   2. Soundex truncates to four characters, so it both missed real matches on long
 *      words and collided on unrelated ones.
 *   3. Nothing handled speech recognition splitting or joining words, which is
 *      exactly what it does to names it doesn't know: "Anita" arrives as "a nita".
 *
 * Everything here is pure, so the behaviour is pinned by lib/word-match.test.ts
 * rather than by running a rehearsal and listening.
 */

/* ─── Normalizing ────────────────────────────────────────────────────── */

/**
 * Fold text to bare lowercase words.
 *
 * Hyphens and dashes become spaces (they separate spoken words), apostrophes
 * simply vanish (they don't — "I've" is one word), and a missing space after
 * sentence punctuation is repaired so "talk.We" reads as two words.
 */
export function normWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―−-]+/g, ' ') // hyphens and dashes separate words
    .replace(/([.!?;:,])([a-z0-9])/gi, '$1 $2') // "talk.We" → "talk. We"
    .replace(/['‘’`]/g, '') // apostrophes never separate
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Normalized words of a line, in order. */
export function tokenize(s: string): string[] {
  const n = normWords(s);
  return n ? n.split(' ').filter(Boolean) : [];
}

/* ─── Canonical forms ────────────────────────────────────────────────── */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Spell a number the way it is said, with no separators: 24 → "twentyfour". */
function spellNumber(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ONES[n % 10] : '');
  if (n < 1000) {
    const rest = n % 100;
    return ONES[Math.floor(n / 100)] + 'hundred' + (rest ? spellNumber(rest) : '');
  }
  const rest = n % 1000;
  return spellNumber(Math.floor(n / 1000)) + 'thousand' + (rest ? spellNumber(rest) : '');
}

/**
 * Contractions, mapped to their expansion with the space removed.
 *
 * A script writes "I've" but an actor may well say "I have", and either is a
 * correct delivery of the line. Joining without a space lets the span matcher
 * line "ive" up against the two tokens "i have".
 */
const CONTRACTIONS: Record<string, string> = {
  im: 'iam', ive: 'ihave', ill: 'iwill', id: 'iwould',
  youre: 'youare', youve: 'youhave', youll: 'youwill', youd: 'youwould',
  hes: 'heis', shes: 'sheis', its: 'itis', thats: 'thatis', whats: 'whatis',
  theres: 'thereis', heres: 'hereis', whos: 'whois', lets: 'letus',
  were: 'weare', weve: 'wehave', well: 'wewill', wed: 'wewould',
  theyre: 'theyare', theyve: 'theyhave', theyll: 'theywill', theyd: 'theywould',
  dont: 'donot', doesnt: 'doesnot', didnt: 'didnot',
  cant: 'cannot', couldnt: 'couldnot', wont: 'willnot', wouldnt: 'wouldnot',
  shouldnt: 'shouldnot', isnt: 'isnot', arent: 'arenot', wasnt: 'wasnot',
  werent: 'werenot', hasnt: 'hasnot', havent: 'havenot', hadnt: 'hadnot',
  aint: 'amnot',
};

/** The form a word is compared in: numerals spelled out, contractions expanded. */
function canonical(w: string): string {
  if (/^\d+$/.test(w)) {
    const n = parseInt(w, 10);
    if (n >= 0 && n < 1_000_000) return spellNumber(n);
  }
  return CONTRACTIONS[w] ?? w;
}

/* ─── Phonetics ──────────────────────────────────────────────────────── */

/**
 * A rough sound-alike key: consonant skeleton with common digraphs folded.
 *
 * Unlike soundex this doesn't truncate, so long words stay distinguishable
 * ("ferguson" and "fergusen" agree; "ferguson" and "forgiveness" don't).
 */
function phoneticKey(w: string): string {
  let s = w
    .replace(/^(kn|gn|wr)/, 'n')
    .replace(/^ps/, 's')
    .replace(/ough/g, 'o')
    .replace(/ph/g, 'f')
    .replace(/gh/g, '')
    .replace(/ck/g, 'k')
    .replace(/qu?/g, 'k')
    .replace(/[cs]h/g, 'x')
    .replace(/th/g, '0')
    .replace(/ti(on|al)/g, 'xn')
    .replace(/c([eiy])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 's')
    .replace(/mb$/, 'm');

  // Keep the first character even if it's a vowel — word openings carry a lot of
  // identity — then drop vowels from the rest.
  const head = s.slice(0, 1);
  const tail = s.slice(1).replace(/[aeiouyh]/g, '');
  s = head + tail;

  return s.replace(/(.)\1+/g, '$1'); // collapse doubles
}

/** Levenshtein distance, iterative single-row. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Shortest word that may be compared by sound rather than spelling. */
const PHONETIC_MIN_LENGTH = 4;
/** How alike two words must look to count as the same word misheard. */
const SIMILARITY_FLOOR = 0.8;

/**
 * Are these two normalized words the same word?
 *
 * Exact first, then canonical (numeral or contraction), then — for words long
 * enough that a coincidence is unlikely — by sound or by spelling distance.
 * Short words are held to exact matching only: under any phonetic scheme "be"
 * and "by" collapse together, and half a line lighting up on one syllable is
 * far worse than a missed highlight.
 */
export function wordsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const ca = canonical(a);
  const cb = canonical(b);
  if (ca === cb) return true;

  if (ca.length < PHONETIC_MIN_LENGTH || cb.length < PHONETIC_MIN_LENGTH) return false;

  if (phoneticKey(ca) === phoneticKey(cb)) return true;

  const distance = levenshtein(ca, cb);
  const similarity = 1 - distance / Math.max(ca.length, cb.length);
  return similarity >= SIMILARITY_FLOOR;
}

/* ─── Alignment ──────────────────────────────────────────────────────── */

/** How many transcript words one expected word may be spread across, and vice versa. */
const MAX_SPAN = 2;

/**
 * Line up what was said against what was written, and report which expected
 * words were reached.
 *
 * The walk is monotonic — the transcript cursor only moves forward — so a word
 * that appears twice in a line is matched at the position it was actually said,
 * not everywhere at once. A word the microphone mangles is skipped without
 * stranding the words after it.
 *
 * Spans in both directions are tried because recognition splits and joins words
 * constantly: "Anita" comes back as "a nita", "twenty four" as "twentyfour".
 *
 * @returns indices into `expected` that were matched.
 */
export function alignWords(expected: string[], transcript: string[]): Set<number> {
  const matched = new Set<number>();
  if (!expected.length || !transcript.length) return matched;

  let ti = 0; // transcript cursor — never moves backwards

  for (let ei = 0; ei < expected.length; ei++) {
    for (let k = ti; k < transcript.length; k++) {
      // One expected word against one, then several, transcript words.
      let consumedExpected = 0;
      let nextTi = -1;

      for (let span = 1; span <= MAX_SPAN && k + span <= transcript.length; span++) {
        const heard = transcript.slice(k, k + span).join('');
        if (wordsMatch(expected[ei], heard)) {
          consumedExpected = 1;
          nextTi = k + span;
          break;
        }
      }

      // Several expected words against one transcript word.
      if (!consumedExpected) {
        for (let span = 2; span <= MAX_SPAN && ei + span <= expected.length; span++) {
          const written = expected.slice(ei, ei + span).join('');
          if (written.length >= PHONETIC_MIN_LENGTH && wordsMatch(written, transcript[k])) {
            consumedExpected = span;
            nextTi = k + 1;
            break;
          }
        }
      }

      if (consumedExpected) {
        for (let n = 0; n < consumedExpected; n++) matched.add(ei + n);
        ei += consumedExpected - 1;
        ti = nextTi;
        break;
      }
    }
  }

  return matched;
}

/** Fraction of the written line the actor actually reached (0–1). */
export function wordMatchScore(expected: string, transcript: string): number {
  const expectedWords = tokenize(expected);
  if (!expectedWords.length) return 1;
  return alignWords(expectedWords, tokenize(transcript)).size / expectedWords.length;
}
