/**
 * After: how it went, and what you'd change. One note a time you did the
 * piece (an audition, a self-tape, a class, a rehearsal, a show), kept on the
 * role, newest first. The last "what I'd change" opens the next Places and
 * the next prep, so you start from your own note, not from scratch.
 * Plain TS for Ghost Light.
 */

import type { Role } from "./notebook";

export type TakeKind = "audition" | "self_tape" | "class" | "rehearsal" | "show";
export type TakeFeel = "landed" | "mixed" | "off";

export type Take = {
  id: string;
  /** When it happened (ms). */
  at: number;
  kind: TakeKind;
  feel: TakeFeel | null;
  worked: string;
  change: string;
};

export const KINDS: { id: TakeKind; name: string }[] = [
  { id: "audition", name: "Audition" },
  { id: "self_tape", name: "Self-tape" },
  { id: "class", name: "Class" },
  { id: "rehearsal", name: "Rehearsal" },
  { id: "show", name: "Show" },
];

export const FEELS: { id: TakeFeel; name: string }[] = [
  { id: "landed", name: "It landed" },
  { id: "mixed", name: "Some of it" },
  { id: "off", name: "It didn't" },
];

/** Long enough after a run that "how did it go?" is a real question, not a nag. */
export const ASK_AFTER_MS = 20 * 60 * 1000;

/** The role was worked (Places or Run it) and nothing has been written since. */
export function afterDue(role: Role, now = Date.now()): boolean {
  const ran = role.ranAt ?? 0;
  if (!ran || now - ran < ASK_AFTER_MS) return false;
  if ((role.afterDismissedAt ?? 0) >= ran) return false;
  const last = role.takes?.[0]?.at ?? 0;
  return last < ran;
}

/** The most recent thing you said you'd change, for the next run. */
export function lastChange(role: Role): string | null {
  const t = role.takes?.find((x) => x.change.trim());
  return t ? t.change.trim() : null;
}

const KIND_IDS = new Set(KINDS.map((k) => k.id));
const FEEL_IDS = new Set(FEELS.map((f) => f.id));

/** Rebuild takes from untrusted JSON (sync). */
export function cleanTakes(raw: unknown): Take[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t.id === "string" && typeof t.at === "number" && KIND_IDS.has(t.kind))
    .map((t) => ({
      id: t.id,
      at: t.at,
      kind: t.kind as TakeKind,
      feel: FEEL_IDS.has(t.feel) ? (t.feel as TakeFeel) : null,
      worked: typeof t.worked === "string" ? t.worked : "",
      change: typeof t.change === "string" ? t.change : "",
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 100);
}
