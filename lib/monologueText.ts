/**
 * Parses monologue text into segments for display: plain text, stage directions,
 * and quoted dialogue. Used to style these differently in the UI.
 *
 * Supports multiple conventions:
 * - ( ... ) or [ ... ] → stage direction (italic, muted)
 * - " ... " or ' ... ' → dialogue (italic, subtle border)
 *
 * Works for any language; patterns are punctuation-based.
 */

export type MonologueSegment =
  | { type: "text"; content: string }
  | { type: "stage"; content: string }
  | { type: "dialogue"; content: string };

/**
 * Matches:
 * - ( ... ) or [ ... ] → stage direction (parentheses or square brackets)
 * - " ... " or ' ... ' → quoted dialogue
 */
const SEGMENT_RE = /(\([^)]*\)|\[[^\]]*\]|"[^"]*"|'[^']*')/g;

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
