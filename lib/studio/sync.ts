/**
 * Merging the notebook in this browser with the one on the account.
 *
 * Pure functions, no fetch and no React: the hook in components/studio does
 * the network, Ghost Light can reuse the rules. Per role, the newest
 * `updatedAt` wins; a delete is a tombstone with its own time, and it loses to
 * an edit made after it.
 */

import { AIRS } from "./air";
import { clampPoint } from "./effort";
import { newRole, type Notebook, type Piece, type Role } from "./notebook";

export type ServerRole = { id: string; updated_at: number; deleted: boolean; data: unknown };

/** A role with nothing in it is not worth sending anywhere. */
export function isBlank(r: Role): boolean {
  return (
    !r.name.trim() &&
    !r.scene.trim() &&
    !r.piece &&
    !r.moments.length &&
    !Object.values(r.answers).some((v) => v?.trim())
  );
}

/** Trust nothing from the wire: rebuild a role from what the server returned. */
export function roleFromServer(s: ServerRole): Role | null {
  const d = s.data as Partial<Role> | null;
  if (!d || typeof d !== "object") return null;
  const moments = Array.isArray(d.moments)
    ? d.moments
        .filter((m) => m && typeof m.id === "string" && m.point)
        .map((m) => ({
          id: m.id,
          label: typeof m.label === "string" ? m.label : "",
          note: typeof m.note === "string" ? m.note : "",
          point: clampPoint(m.point),
          ...(typeof m.line === "number" && m.line >= 0 ? { line: Math.floor(m.line) } : {}),
          ...(AIRS.some((a) => a.id === m.air) ? { air: m.air } : {}),
        }))
    : [];
  const answers: Role["answers"] = {};
  if (d.answers && typeof d.answers === "object")
    for (const [k, v] of Object.entries(d.answers)) if (typeof v === "string") answers[k as keyof Role["answers"]] = v;
  const p = d.piece as Partial<Piece> | null | undefined;
  const piece: Piece | null =
    p && typeof p.id === "number"
      ? {
          id: p.id,
          title: String(p.title ?? ""),
          character: String(p.character ?? ""),
          play: String(p.play ?? ""),
          author: String(p.author ?? ""),
        }
      : null;
  return {
    id: s.id,
    piece,
    name: typeof d.name === "string" ? d.name : "",
    scene: typeof d.scene === "string" ? d.scene : "",
    answers,
    moments,
    updatedAt: s.updated_at,
  };
}

export type Merge = {
  nb: Notebook;
  /** Roles this browser has newer than the account. */
  push: Role[];
  /** Tombstones this browser has newer than the account's copy. */
  remove: { id: string; at: number }[];
};

export function merge(local: Notebook, server: ServerRole[]): Merge {
  const deleted = { ...(local.deleted ?? {}) };
  const synced = { ...(local.synced ?? {}) };
  const byId = new Map(local.roles.map((r) => [r.id, r]));
  const out = new Map<string, Role>();
  const push: Role[] = [];
  const remove: { id: string; at: number }[] = [];

  for (const s of server) {
    const mine = byId.get(s.id);
    const myDelete = deleted[s.id];
    byId.delete(s.id);
    if (s.deleted) {
      if (mine && mine.updatedAt > s.updated_at) {
        out.set(mine.id, mine);
        push.push(mine);
      } else {
        synced[s.id] = s.updated_at;
      }
      delete deleted[s.id];
      continue;
    }
    if (myDelete !== undefined && myDelete > s.updated_at) {
      remove.push({ id: s.id, at: myDelete });
      continue;
    }
    delete deleted[s.id];
    if (mine && mine.updatedAt > s.updated_at) {
      out.set(mine.id, mine);
      push.push(mine);
      continue;
    }
    const theirs = roleFromServer(s);
    if (theirs) {
      out.set(theirs.id, theirs);
      synced[s.id] = s.updated_at;
    }
  }

  // Only here: new since the last sync.
  for (const r of byId.values()) {
    out.set(r.id, r);
    if (!isBlank(r)) push.push(r);
  }
  // A tombstone the account never heard of has nothing to delete.
  for (const id of Object.keys(deleted)) if (!server.some((s) => s.id === id)) delete deleted[id];

  let roles = [...out.values()];
  // The empty starter role a fresh device makes shouldn't sit beside real work.
  if (roles.some((r) => !isBlank(r))) roles = roles.filter((r) => !isBlank(r) || r.id === local.activeId);
  if (roles.length > 1) roles = roles.filter((r) => !isBlank(r));
  if (!roles.length) roles = [newRole()];
  roles.sort((a, b) => b.updatedAt - a.updatedAt);

  const activeId = roles.some((r) => r.id === local.activeId) ? local.activeId : roles[0].id;
  return { nb: { ...local, roles, activeId, deleted, synced }, push, remove };
}

/** What still has to go up: edited since its last sync, and not empty. */
export function dirty(nb: Notebook): Role[] {
  return nb.roles.filter((r) => !isBlank(r) && r.updatedAt > (nb.synced?.[r.id] ?? 0));
}
