/**
 * Performed-duration estimate, ported 1:1 from the backend
 * (backend/app/utils/duration.py) so a cut's live duration matches the
 * estimated_duration_seconds the server would compute for the same text.
 * Do NOT invent a second WPM here — keep this in lockstep with duration.py.
 */

const BASE_WPM = 130;
const PAUSE_ELLIPSIS = 1.0;
const PAUSE_SENTENCE_END = 0.5;
const PAUSE_PARAGRAPH = 0.8;
const PAUSE_CLAUSE = 0.2;

export function estimateDurationSeconds(text: string): number {
  if (!text || !text.trim()) return 0;

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount === 0) return 0;

  const baseSeconds = (wordCount / BASE_WPM) * 60;

  const ellipsisCount = (text.match(/\.{3}|…/g) || []).length;
  const textNoEllipsis = text.replace(/\.{3}|…/g, "");

  const sentenceEnds = (textNoEllipsis.match(/[.!?]+/g) || []).length;
  const clauseBreaks = (text.match(/[,;:—–]/g) || []).length;
  const paragraphBreaks = (text.match(/\n\s*\n/g) || []).length;
  let singleBreaks = (text.match(/\n/g) || []).length - paragraphBreaks * 2;
  singleBreaks = Math.max(0, singleBreaks);

  const pauseSeconds =
    ellipsisCount * PAUSE_ELLIPSIS +
    sentenceEnds * PAUSE_SENTENCE_END +
    clauseBreaks * PAUSE_CLAUSE +
    paragraphBreaks * PAUSE_PARAGRAPH +
    singleBreaks * PAUSE_CLAUSE;

  return Math.max(5, Math.round(baseSeconds + pauseSeconds));
}

/** "1:45" style label for a duration in seconds. */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
