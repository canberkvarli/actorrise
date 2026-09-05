/**
 * The units an audition cut is made of.
 *
 * Cut used to split on "\n" alone. 19,649 of 20,002 monologues — 98.2% —
 * contain no newline at all, because the corpus is stored as prose paragraphs
 * (see the "corpus has no line breaks" note). So for almost every piece the
 * editor offered exactly one selectable unit, and "cut" could only mean
 * "select the whole thing or nothing". That is not a rough edge; it is the
 * feature never having worked. Two saved cuts exist across the entire product.
 *
 * So: verse keeps its lines, prose gets sentences.
 *
 * Verse is the case where a line IS the unit an actor thinks in, and the 1.8%
 * that carry real line breaks are overwhelmingly verse. Everything else gets
 * split at sentence boundaries, which is the smallest chunk you can cut a
 * speech at without it stopping mid-thought.
 */

/**
 * True only for verse.
 *
 * "Has a newline" is not the test, and getting this wrong silently undoes the
 * whole fix: the Broadcast News speech is two prose paragraphs separated by a
 * blank line, so a two-line threshold classed it as verse and handed the
 * editor one 780-character chunk again. Verse is many SHORT lines; paragraphed
 * prose is two or three very long ones.
 */
function isLineated(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 4) return false;
  const avg = lines.reduce((a, l) => a + l.length, 0) / lines.length;
  return avg <= 100;
}

/**
 * Sentence boundaries, tuned for dramatic text rather than for prose generally.
 *
 * The lookbehind requires terminal punctuation followed by whitespace and then
 * something that starts a new sentence. Ellipses and em dashes are deliberately
 * NOT boundaries: this corpus is full of "I promised myself I wouldn't
 * cry... It's just hard not to—" where breaking at every "..." would shred a
 * single thought into fragments no one would ever cut at.
 */
function toSentences(text: string): string[] {
  const parts = text
    // Split after . ! or ? (plus any closing quote) when followed by space and
    // a capital, a quote, or a dash — i.e. the start of something new.
    .split(/(?<=[.!?]["'”’)]?)\s+(?=["'“‘(]?[A-Z0-9])/g)
    .map((s) => s.trim())
    .filter(Boolean);

  /* A sentence of two or three words ("I'm not.", "No, it wasn't.") is a real
     sentence but a useless thing to offer as a separate row — the list becomes
     a wall of fragments. Glue anything very short onto the one before it. */
  const out: string[] = [];
  for (const p of parts) {
    const words = p.split(/\s+/).length;
    if (out.length > 0 && words <= 3) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  return out.length ? out : [text];
}

/**
 * The selectable units for a piece, in order. `cut_start_line` and
 * `cut_end_line` are indices into exactly this array, so every consumer — the
 * editor that writes them and the export that applies them — must call this
 * and nothing else.
 */
export function monologueSegments(text: string | null | undefined): string[] {
  const t = text ?? "";
  if (!t.trim()) return [];
  // Blank lines are dropped rather than kept as empty rows: they were only ever
  // unselectable filler in the editor, and they shifted every index after them.
  return isLineated(t) ? t.split("\n").filter((l) => l.trim()) : toSentences(t);
}

/** Apply a saved cut. Returns the whole piece when no cut is set. */
export function applyCut(
  text: string | null | undefined,
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  const full = text ?? "";
  if (start === null || start === undefined || end === null || end === undefined) return full;
  const segments = monologueSegments(full);
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(segments.length - 1, Math.max(start, end));
  if (lo > hi) return full;
  return segments.slice(lo, hi + 1).join(isLineated(full) ? "\n" : " ");
}
