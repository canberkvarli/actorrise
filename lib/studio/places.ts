/**
 * Places: the minute before you go on, built from the role's own notebook.
 *
 * A breath, the answers that put you in the world (who, where, what just
 * happened, what you want), each moment of the arc in order with its line,
 * then the first line and "Go." About a minute for a full notebook. Plain TS:
 * Ghost Light can play the same cues.
 */

import type { EffortPoint } from "./effort";
import type { Role } from "./notebook";
import type { QuestionId } from "./questions";

export type Cue =
  | { kind: "breath"; ms: number }
  | { kind: "answer"; ask: string; text: string; ms: number }
  | { kind: "moment"; index: number; label: string; line: string | null; note: string; point: EffortPoint; ms: number }
  | { kind: "first"; line: string; ms: number }
  | { kind: "go"; ms: number };

/** The answers worth hearing again in the wings, in the order you'd want them. */
const ASK: { id: QuestionId; ask: string }[] = [
  { id: "who", ask: "Who you are" },
  { id: "where", ask: "Where you are" },
  { id: "before", ask: "What just happened" },
  { id: "want", ask: "What you want" },
  { id: "obstacle", ask: "What's in your way" },
];

/** Long answers are trimmed to their first sentence or two: this is a reminder, not a reread. */
export function gist(text: string, max = 180): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export function buildCues(role: Role, lines: string[] = [], reducedMotion = false): Cue[] {
  const cues: Cue[] = [{ kind: "breath", ms: reducedMotion ? 3000 : 7000 }];
  for (const { id, ask } of ASK) {
    const a = role.answers[id]?.trim();
    if (a) cues.push({ kind: "answer", ask, text: gist(a), ms: 5000 + Math.min(3000, a.length * 20) });
  }
  role.moments.forEach((m, index) => {
    const line = typeof m.line === "number" ? (lines[m.line] ?? null) : null;
    cues.push({
      kind: "moment",
      index,
      label: m.label.trim(),
      line,
      note: gist(m.note, 140),
      point: m.point,
      ms: 5500,
    });
  });
  if (lines[0]) cues.push({ kind: "first", line: lines[0], ms: 5000 });
  cues.push({ kind: "go", ms: 2600 });
  return cues;
}

/** Is there enough here to be worth running? A breath and "Go." alone isn't. */
export function hasPlaces(role: Role): boolean {
  return role.moments.length > 0 || ASK.some(({ id }) => role.answers[id]?.trim());
}
