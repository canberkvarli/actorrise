/**
 * Pure line-matching helpers for off-book rehearsal.
 *
 * These mirror the matching logic currently inlined in the ScenePartner scene
 * flow (`app/(platform)/scenes/[id]/rehearse/page.tsx`). They live here so the
 * monologue "work" flow can reuse them and so the logic is unit-testable
 * without a browser. (Follow-up: dedupe the scene page to import from here.)
 */

/** Lowercase, strip punctuation, split into words. */
export function normWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Standard Soundex — used to forgive phonetic STT slips (e.g. "there"/"their"). */
export function soundex(word: string): string {
  const s = word.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";
  const codes: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3",
    L: "4",
    M: "5", N: "5",
    R: "6",
  };
  let result = s[0];
  let prev = codes[s[0]] || "";
  for (let i = 1; i < s.length; i++) {
    const letter = s[i];
    const code = codes[letter] || "";
    if (code && code !== prev) result += code;
    // Vowels reset the running digit; H and W do not.
    if (letter !== "H" && letter !== "W") prev = code;
  }
  return (result + "000").slice(0, 4);
}

/** Two words "match" if identical or phonetically equivalent (length-gated). */
export function wordsMatch(a: string, b: string): boolean {
  return (
    a === b ||
    (a.length >= 3 && b.length >= 3 && soundex(a) === soundex(b))
  );
}

/**
 * Fraction (0–1) of the expected line's words that appear in the transcript.
 * Order-independent and fuzzy — good enough to tell "they said the line" from
 * "they're still stalling".
 */
export function wordMatchScore(expected: string, transcript: string): number {
  const exp = normWords(expected);
  if (exp.length === 0) return 1;
  const tr = normWords(transcript);
  if (tr.length === 0) return 0;
  const trSet = new Set(tr);
  let hits = 0;
  for (const w of exp) {
    if (trSet.has(w) || tr.some((t) => wordsMatch(w, t))) hits++;
  }
  return hits / exp.length;
}

/**
 * How many leading words of `line` have been spoken so far, in order.
 * Drives live word-by-word highlighting (karaoke style): a greedy sequential
 * matcher that advances a pointer through the line as matching spoken words
 * arrive, skipping filler/misheard words that don't match the next target.
 */
export function spokenPrefixCount(line: string, transcript: string): number {
  const target = normWords(line);
  const spoken = normWords(transcript);
  if (target.length === 0 || spoken.length === 0) return 0;
  let p = 0;
  for (const w of spoken) {
    if (p >= target.length) break;
    if (wordsMatch(w, target[p])) p += 1;
  }
  return p;
}

/**
 * Split a block of monologue text into deliverable "lines" (sentences).
 * Stage directions in [brackets] are stripped first.
 */
export function toDeliverableLines(text: string): string[] {
  const cleaned = text
    .replace(/\[([^\]]+)\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return parts.map((p) => p.trim()).filter(Boolean);
}
