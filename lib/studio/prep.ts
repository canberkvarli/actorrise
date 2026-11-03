/**
 * The guided path through a role, as data: the steps and where to pick up.
 * Plain TS, so Ghost Light can walk the same path.
 *
 *   piece → read it → four questions → the beats → ready.
 */

import type { Role } from "./notebook";
import type { QuestionId } from "./questions";

/** The four that put you in the scene. The rest wait in the notebook. */
export const CORE: QuestionId[] = ["who", "before", "want", "obstacle"];

export type Step =
  | { kind: "piece" }
  | { kind: "read" }
  | { kind: "ask"; id: QuestionId }
  | { kind: "beats" }
  | { kind: "done" };

export const STEPS: Step[] = [
  { kind: "piece" },
  { kind: "read" },
  ...CORE.map((id) => ({ kind: "ask" as const, id })),
  { kind: "beats" },
  { kind: "done" },
];

/** Where to pick up: the first thing not yet done. */
export function resumeAt(role: Role): number {
  if (!role.piece) return 0;
  const firstEmpty = CORE.findIndex((id) => !role.answers[id]?.trim());
  if (firstEmpty === 0 && !role.moments.length) return 1; // a piece and nothing else: read it first
  if (firstEmpty >= 0) return 2 + firstEmpty;
  return role.moments.length ? STEPS.length - 1 : STEPS.length - 2;
}
