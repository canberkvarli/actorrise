import { describe, expect, it } from "vitest";

import { countdown, whenLabel, groupByScope, toLocalInput, fromLocalInput, changedFields, momentsFor, type Audition } from "./auditions";

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
  it("hours inside 12, Today and Tomorrow by calendar day in the zone", () => {
    expect(countdown("2026-10-07T20:00:00Z", NOW)).toEqual({ n: "5", unit: "hours" });
    expect(countdown("2026-10-07T23:30:00Z", new Date("2026-10-07T01:00:00Z"))).toEqual({ n: "Today", unit: "" });
    expect(countdown("2026-10-08T20:00:00Z", NOW)).toEqual({ n: "Tomorrow", unit: "" });
  });
  it("counts calendar days in the audition zone, not elapsed time", () => {
    const mon = new Date("2026-10-06T03:00:00Z"); // Mon 10 PM in LA
    expect(countdown("2026-10-08T16:00:00Z", mon, "America/Los_Angeles")).toEqual({ n: "3", unit: "days" });
  });
  it("past dates read in the zone", () => {
    expect(countdown("2026-10-02T03:00:00Z", NOW, "America/Los_Angeles")).toEqual({ n: "Oct 1", unit: "" });
  });
  it("an invalid zone falls back to UTC", () => {
    expect(countdown("2026-10-11T15:00:00Z", NOW, "Nope/Zone")).toEqual({ n: "4", unit: "days" });
    expect(whenLabel({ when: "2026-10-09T14:40:00Z", tz: "Nope/Zone", kind: "in_person" })).toBe("Fri, Oct 9 · 2:40 PM");
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
  it("ignores objects that did not change", () => {
    expect(changedFields({ material: { genre: "comedic" } }, { material: { genre: "comedic" } })).toEqual([]);
  });
});

describe("momentsFor", () => {
  const a = { when: "2026-10-13T18:40:00Z", tz: "America/New_York", kind: "in_person" as const };
  it("has no stops without a date", () => {
    expect(momentsFor({ ...a, when: null })).toEqual([]);
  });
  it("marks only the stops behind you", () => {
    const m = momentsFor(a, new Date("2026-10-11T12:00:00Z"));
    expect(m.map((x) => x.key)).toEqual(["prep", "eve", "day", "after"]);
    expect(m.map((x) => x.passed)).toEqual([true, false, false, false]);
    expect(m[2].day).toBe("Tue");
  });
  it("calls the day a tape due for a self-tape", () => {
    expect(momentsFor({ ...a, kind: "self_tape" })[2].label).toBe("tape due");
  });
});
