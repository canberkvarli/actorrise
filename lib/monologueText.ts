/**
 * Parses monologue text into segments for display: plain text, stage directions,
 * and quoted dialogue. Used to style these differently in the UI.
 *
 * Supports:
 * - ( ... ) or [ ... ] → stage direction (italic, muted)
 * - " ... " → dialogue (italic, subtle border)
 *
 * Single quotes are NOT used for dialogue so that apostrophes in contractions
 * (don't, it's, we're) don't get misread and cause a visible "pipe" border.
 */

export type MonologueSegment =
  | { type: "text"; content: string }
  | { type: "stage"; content: string }
  | { type: "dialogue"; content: string };

/**
 * Matches (in order):
 * - ALL CAPS NAME (2+ uppercase words) followed by text → character cue (stage direction)
 * - _italic text_ → stage direction (common in Ibsen, classical formatting)
 * - ( ... ) or [ ... ] → stage direction
 * - " ... " → quoted dialogue (double quotes only; single quotes stay plain text)
 */
const SEGMENT_RE = /(\b[A-Z][A-Z]+(?:\s+[A-Z][A-Z]+)*\s+_[^_]+_\.?|_[^_]+_|\([^)]*\)|\[[^\]]*\]|"[^"]*")/g;

function isStageDirection(raw: string): boolean {
  return raw.startsWith("(") || raw.startsWith("[") || raw.includes("_");
}

/**
 * Heuristic: returns true if the text looks like scraped bibliographic/catalog data
 * rather than an actual monologue (e.g. "LASTNAME, Firstname Title . p 2m 1w").
 */
export function isBibliographicText(text: string): boolean {
  if (!text) return false;
  // Catalog lines have patterns like: ALLCAPS, Firstname Title . p Xm Xw
  const catalogPattern = /\b[A-Z]{2,},\s+[A-Z][a-z]/g;
  const matches = text.match(catalogPattern);
  return (matches?.length ?? 0) >= 3;
}

/**
 * Returns the percentage of text that is stage directions (0-100).
 * Useful for flagging monologues that are mostly stage directions.
 */
export function stageDirectionPercentage(text: string): number {
  if (!text) return 0;
  const segments = parseMonologueText(text);
  const totalLen = segments.reduce((sum, s) => sum + s.content.length, 0);
  if (totalLen === 0) return 0;
  const stageLen = segments
    .filter((s) => s.type === "stage")
    .reduce((sum, s) => sum + s.content.length, 0);
  return Math.round((stageLen / totalLen) * 100);
}

export function parseMonologueText(text: string): MonologueSegment[] {
  if (!text || typeof text !== "string") return [{ type: "text", content: text || "" }];

  // Strip orphaned leading ']' and trailing '[' left by mid-scene scraping cuts
  text = text.replace(/^\s*\]\s*/, "").replace(/\s*\[\s*$/, "");

  const segments: MonologueSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  SEGMENT_RE.lastIndex = 0;
  while ((m = SEGMENT_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, m.index) });
    }
    const raw = m[0];
    segments.push({
      type: isStageDirection(raw) ? "stage" : "dialogue",
      content: raw,
    });
    lastIndex = SEGMENT_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}
