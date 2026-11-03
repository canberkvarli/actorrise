import { describe, expect, it } from "vitest";

import { newRole, type Notebook, type Role } from "./notebook";
import { dirty, isBlank, merge, type ServerRole } from "./sync";

const role = (id: string, name: string, updatedAt: number): Role => ({
  ...newRole(name),
  id,
  updatedAt,
});
const server = (id: string, name: string, updated_at: number, deleted = false): ServerRole => ({
  id,
  updated_at,
  deleted,
  data: deleted ? null : { name, scene: "", answers: {}, moments: [] },
});
const nb = (roles: Role[], extra: Partial<Notebook> = {}): Notebook => ({
  roles,
  activeId: roles[0]?.id ?? null,
  ...extra,
});

describe("merge", () => {
  it("takes the account's newer copy and keeps this browser's newer one", () => {
    const m = merge(nb([role("a", "Mine old", 100), role("b", "Mine new", 300)]), [
      server("a", "Theirs new", 200),
      server("b", "Theirs old", 200),
    ]);
    const names = Object.fromEntries(m.nb.roles.map((r) => [r.id, r.name]));
    expect(names).toEqual({ a: "Theirs new", b: "Mine new" });
    expect(m.push.map((r) => r.id)).toEqual(["b"]);
    expect(m.nb.synced?.a).toBe(200);
  });

  it("brings in roles from the account this browser has never seen", () => {
    const m = merge(nb([newRole()]), [server("x", "Nina", 50)]);
    expect(m.nb.roles.map((r) => r.name)).toEqual(["Nina"]);
    expect(m.push).toEqual([]);
  });

  it("drops the empty starter role once real work arrives", () => {
    const blank = newRole();
    const m = merge(nb([blank], { activeId: "other" }), [server("x", "Nina", 50)]);
    expect(m.nb.roles.some(isBlank)).toBe(false);
  });

  it("uploads new local work but never an empty role", () => {
    const m = merge(nb([role("a", "Hamlet", 10), newRole()]), []);
    expect(m.push.map((r) => r.name)).toEqual(["Hamlet"]);
  });

  it("removes a role deleted on another device", () => {
    const m = merge(nb([role("a", "Hamlet", 100)]), [server("a", "", 200, true)]);
    expect(m.nb.roles.find((r) => r.id === "a")).toBeUndefined();
  });

  it("keeps a role edited here after it was deleted elsewhere", () => {
    const m = merge(nb([role("a", "Hamlet", 300)]), [server("a", "", 200, true)]);
    expect(m.nb.roles[0].name).toBe("Hamlet");
    expect(m.push.map((r) => r.id)).toEqual(["a"]);
  });

  it("sends a newer local delete up, and lets a newer edit elsewhere win over it", () => {
    const local = nb([newRole()], { deleted: { a: 300, b: 100 } });
    const m = merge(local, [server("a", "Old", 200), server("b", "Edited later", 200)]);
    expect(m.remove).toEqual([{ id: "a", at: 300 }]);
    expect(m.nb.roles.map((r) => r.name)).toEqual(["Edited later"]);
  });

  it("rebuilds roles from the wire defensively", () => {
    const bad: ServerRole = {
      id: "z",
      updated_at: 5,
      deleted: false,
      data: { name: "Z", moments: [{ id: "m", point: { weight: 9, space: -9, time: 0 } }, { nope: 1 }] },
    };
    const m = merge(nb([newRole()]), [bad]);
    const z = m.nb.roles.find((r) => r.id === "z")!;
    expect(z.moments).toHaveLength(1);
    expect(z.moments[0].point).toEqual({ weight: 1, space: -1, time: 0 });
  });
});

describe("dirty", () => {
  it("is what changed since the account last confirmed it", () => {
    const n = nb([role("a", "A", 100), role("b", "B", 200), newRole()], { synced: { a: 100, b: 150 } });
    expect(dirty(n).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("roleFromServer: the piece and lines", () => {
  it("keeps the piece and each moment's line, and drops a bad line", () => {
    const s: ServerRole = {
      id: "p",
      updated_at: 9,
      deleted: false,
      data: {
        name: "Nina",
        piece: { id: 42, title: "Nina", character: "Nina", play: "The Seagull", author: "Chekhov" },
        moments: [
          { id: "a", point: { weight: 0, space: 0, time: 0 }, line: 3 },
          { id: "b", point: { weight: 0, space: 0, time: 0 }, line: -1 },
        ],
      },
    };
    const m = merge(nb([newRole()]), [s]);
    const r = m.nb.roles.find((x) => x.id === "p")!;
    expect(r.piece?.id).toBe(42);
    expect(r.moments.map((x) => x.line)).toEqual([3, undefined]);
  });
});
