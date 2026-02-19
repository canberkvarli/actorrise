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
 * Matches:
 * - ( ... ) or [ ... ] → stage direction
 * - " ... " → quoted dialogue (double quotes only; single quotes stay plain text)
 */
const SEGMENT_RE = /(\([^)]*\)|\[[^\]]*\]|"[^"]*")/g;

function isStageDirection(raw: string): boolean {
  return raw.startsWith("(") || raw.startsWith("[");
}

export function parseMonologueText(text: string): MonologueSegment[] {
  if (!text || typeof text !== "string") return [{ type: "text", content: text || "" }];

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
