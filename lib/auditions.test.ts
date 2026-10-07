import { describe, expect, it } from "vitest";

import { countdown, groupByScope, toLocalInput, fromLocalInput, changedFields, type Audition } from "./auditions";

const NOW = new Date("2026-10-07T15:00:00Z");

function a(over: Partial<Audition>): Audition {
  return {
    id: 1, project: "P", role: null, kind: "in_person", status: "scheduled", starts_at: null, due_at: null,
    when: null, tz: "UTC", location: null, casting: null, material_raw: null, material: null, bring: null,
    notes: null, tape_link: null, source: "manual", user_script_id: null, reminders_on: true, scope: "upcoming",
    created_at: NOW.toISOString(), pieces: [], ...over,
  };
}

describe("countdown", () => {
  it("days when two or more out", () => {
    expect(countdown("2026-10-11T15:00:00Z", NOW)).toEqual({ n: "4", unit: "days" });
  });
  it("hours inside 48", () => {
    expect(countdown("2026-10-08T20:00:00Z", NOW)).toEqual({ n: "29", unit: "hours" });
  });
  it("one hour reads singular, under an hour reads now", () => {
    expect(countdown("2026-10-07T16:10:00Z", NOW)).toEqual({ n: "1", unit: "hour" });
    expect(countdown("2026-10-07T15:20:00Z", NOW)).toEqual({ n: "Now", unit: "" });
  });
  it("past and undated", () => {
    expect(countdown("2026-10-01T15:00:00Z", NOW)).toEqual({ n: "Oct 1", unit: "" });
    expect(countdown(null, NOW)).toEqual({ n: "?", unit: "no date" });
  });
});

describe("groupByScope", () => {
  it("keeps server order inside each group", () => {
    const g = groupByScope([a({ id: 1, scope: "upcoming" }), a({ id: 2, scope: "waiting" }), a({ id: 3, scope: "upcoming" })]);
    expect(g.upcoming.map((x) => x.id)).toEqual([1, 3]);
    expect(g.waiting.map((x) => x.id)).toEqual([2]);
    expect(g.past).toEqual([]);
  });
});

describe("datetime-local round trip", () => {
  it("survives", () => {
    const iso = "2026-10-09T14:40:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(toLocalInput(null)).toBe("");
    expect(fromLocalInput("")).toBeNull();
  });
});

describe("changedFields", () => {
  it("lists parsed fields the actor edited", () => {
    expect(changedFields({ project: "A", role: "B", casting: null }, { project: "A", role: "C", casting: "X" })).toEqual(["role", "casting"]);
  });
});
