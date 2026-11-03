/**
 * A role's notebook: answers to the questions, and moments pinned in the cube.
 *
 * Plain data and plain functions, no React, so Ghost Light can share it.
 * For now it lives in this browser (localStorage); syncing it to the account
 * is the next step once the shape settles.
 */

import { clampPoint, type EffortPoint } from "./effort";
import type { Take } from "./after";
import type { AirId } from "./air";
import type { QuestionId } from "./questions";

export type Moment = {
  id: string;
  /** "The ghost appears", "Alone with the skull". */
  label: string;
  point: EffortPoint;
  note: string;
  /** The line of the piece this moment belongs to, when the role has a piece. */
  line?: number;
  /** The atmosphere of this moment (lib/studio/air.ts). */
  air?: AirId;
};

/** The monologue a role is working on. Only who and what: the text is read live from the library. */
export type Piece = {
  id: number;
  title: string;
  character: string;
  play: string;
  author: string;
};

export type Role = {
  id: string;
  /** "Hamlet" */
  name: string;
  /** "Hamlet, Act 5, the graveyard" */
  scene: string;
  answers: Partial<Record<QuestionId, string>>;
  moments: Moment[];
  piece?: Piece | null;
  /** Notes after doing it, newest first (lib/studio/after.ts). */
  takes?: Take[];
  /** When the role was last worked: Places finished, or Run it. */
  ranAt?: number;
  /** "Not now" on the after card, for that run. */
  afterDismissedAt?: number;
  updatedAt: number;
};

export type Notebook = {
  roles: Role[];
  activeId: string | null;
  /** Roles deleted here and not yet deleted on the account: id -> when. */
  deleted?: Record<string, number>;
  /** The `updatedAt` of each role as the account last confirmed it. */
  synced?: Record<string, number>;
  /** The account this notebook was last synced with, so a shared browser never mixes two actors. */
  owner?: number;
};

const KEY = "studio_notebook_v1";

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function newRole(name = ""): Role {
  return { id: newId(), name, scene: "", answers: {}, moments: [], updatedAt: Date.now() };
}

export function emptyNotebook(): Notebook {
  const r = newRole();
  return { roles: [r], activeId: r.id };
}

function isRole(x: unknown): x is Role {
  const r = x as Role;
  return !!r && typeof r.id === "string" && Array.isArray(r.moments) && typeof r.answers === "object";
}

export function loadNotebook(): Notebook {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyNotebook();
    const nb = JSON.parse(raw) as Notebook;
    const roles = Array.isArray(nb.roles) ? nb.roles.filter(isRole) : [];
    if (!roles.length) return emptyNotebook();
    roles.forEach((r) => r.moments.forEach((m) => (m.point = clampPoint(m.point))));
    const activeId = roles.some((r) => r.id === nb.activeId) ? nb.activeId : roles[0].id;
    return { roles, activeId, deleted: nb.deleted ?? {}, synced: nb.synced ?? {}, owner: nb.owner };
  } catch {
    return emptyNotebook();
  }
}

export function saveNotebook(nb: Notebook): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(nb));
  } catch {
    // Private mode or full storage: the notebook still works for this visit.
  }
}

export function activeRole(nb: Notebook): Role {
  return nb.roles.find((r) => r.id === nb.activeId) ?? nb.roles[0];
}

export function updateRole(nb: Notebook, id: string, fn: (r: Role) => Role): Notebook {
  return {
    ...nb,
    roles: nb.roles.map((r) => (r.id === id ? { ...fn(r), updatedAt: Date.now() } : r)),
  };
}

/** How far the arc travels through the cube, 0 (one spot) .. 1 (corner to corner and back). */
export function arcRange(moments: Moment[]): number {
  if (moments.length < 2) return 0;
  let max = 0;
  for (const a of moments)
    for (const b of moments) {
      const d = Math.hypot(a.point.weight - b.point.weight, a.point.space - b.point.space, a.point.time - b.point.time);
      if (d > max) max = d;
    }
  return Math.min(1, max / (2 * Math.sqrt(3)));
}

/** How many questions have an answer. */
export function answered(r: Role): number {
  return Object.values(r.answers).filter((v) => v && v.trim()).length;
}
