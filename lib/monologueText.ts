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
 * - ALL CAPS NAME + _short action_ → character cue + stage direction (e.g. "EKDAL _mutters_")
 * - _short text_ (under 60 chars) → likely a stage direction (e.g. "_exits_", "_pause_")
 *   BUT: long _text_ is likely verse/italic formatting, NOT a stage direction
 * - ( ... ) or [ ... ] → stage direction
 * - " ... " → quoted dialogue (double quotes only; single quotes stay plain text)
 */
const SEGMENT_RE = /(\b[A-Z][A-Z]+(?:\s+[A-Z][A-Z]+)*\s+_[^_]{1,80}_\.?|_[^_]{1,50}_|\([^)]*\)|\[[^\]]*\]|"[^"]*")/g;

function isStageDirection(raw: string): boolean {
  if (raw.startsWith("(") || raw.startsWith("[")) return true;
  if (raw.includes("_")) {
    // Extract the content between underscores
    const inner = raw.replace(/^[A-Z\s]*_/, "").replace(/_\.?$/, "");
    // Short italic text = stage direction (_exits_, _pause_, _weeping_)
    // Long italic text = verse/formatting, not a stage direction
    return inner.length < 50;
  }
  return false;
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

/**
 * Detects and reflows screenplay-style narrow column text into normal prose.
 * Screenplay dialogue is formatted in ~35-char wide columns with hard line breaks.
 * This joins those into flowing text while preserving intentional paragraph breaks.
 */
function reflowScreenplayText(text: string): string {
  const lines = text.split("\n");
  // Heuristic: if most lines are short (under 45 chars) and don't end with
  // sentence-ending punctuation, it's likely screenplay column formatting
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  if (nonEmptyLines.length < 4) return text;
  const shortLines = nonEmptyLines.filter(l => l.trim().length < 45);
  if (shortLines.length / nonEmptyLines.length < 0.5) return text; // not screenplay format

  const reflowed: string[] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      // Empty line = paragraph break
      if (currentParagraph.length > 0) {
        reflowed.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      continue;
    }
    // Check if this is a stage direction line (ALL CAPS character name + action,
    // or a line describing camera/scene action)
    const isSceneAction = /^[A-Z][A-Z\s,.']+[a-z]/.test(trimmed) &&
      /\b(walks|stands|looks|turns|sits|enters|exits|pulls|grabs|opens|closes|picks|puts|moves|reaches|holds|drops|takes|runs|pushes|starts|stops|falls|rises|throws)\b/i.test(trimmed);
    if (isSceneAction && trimmed.length > 60) {
      // Long action/scene description line - skip it
      if (currentParagraph.length > 0) {
        reflowed.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      continue;
    }
    currentParagraph.push(trimmed);
  }
  if (currentParagraph.length > 0) {
    reflowed.push(currentParagraph.join(" "));
  }

  return reflowed.join("\n\n");
}

export function parseMonologueText(text: string): MonologueSegment[] {
  if (!text || typeof text !== "string") return [{ type: "text", content: text || "" }];

  // Strip orphaned leading ']' and trailing '[' left by mid-scene scraping cuts
  text = text.replace(/^\s*\]\s*/, "").replace(/\s*\[\s*$/, "");

  // Reflow screenplay-style narrow column text into normal prose
  text = reflowScreenplayText(text);

  // Strip trailing scene action lines (e.g. "He stands up and walks out.")
  // These are common in Film/TV extractions where action bleeds into dialogue
  const trailingActionRe = /\n+(?:[A-Z][a-z]+(?:\s+[A-Za-z]+)*\s+(?:stands|walks|sits|looks|turns|enters|exits|pulls|grabs|opens|closes|picks|puts|moves|reaches|holds|drops|takes|runs|pushes|starts|stops|falls|rises|throws|unzips|lets|does|folds|goes|comes|steps|stares|leaves|gets|sets|watches|struggles|emerges|slumps|cries|laughs|smiles|nods|shakes|waves|points|leans|kneels|crawls|climbs|jumps|ducks|rolls|slides|lifts|lowers|strikes|checks|hurries|darts|backs|races)\b[^"]*\.?)$/i;
  text = text.replace(trailingActionRe, "");

  // Also strip lines that are clearly camera/scene directions
  text = text.replace(/\n+(?:ANGLE ON|SERIES OF SHOTS|INTERCUT|CUT TO|FADE|CLOSE ON|EXT\.|INT\.)[^\n]*/g, "");

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
