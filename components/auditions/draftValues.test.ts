import { describe, expect, it } from "vitest";

import { fromLocalInput, type Audition } from "../../lib/auditions";
import { patchFromValues, valuesFromAudition } from "./draftValues";

function aud(over: Partial<Audition> = {}): Audition {
  return {
    id: 1, project: "Hamlet", role: "Ophelia", kind: "in_person", status: "scheduled",
    starts_at: "2026-10-12T18:30:45.123Z", due_at: null, when: "2026-10-12T18:30:45.123Z", tz: "America/New_York",
    location: "Pearl Studios", casting: "Telsey", material_raw: "1 min classical", material: { length: 1 },
    bring: null, notes: null, tape_link: null, source: "parse", user_script_id: null, reminders_on: true,
    scope: "upcoming", created_at: "2026-10-01T00:00:00Z", pieces: [], ...over,
  };
}

describe("valuesFromAudition", () => {
  it("fills the form from a saved audition, nulls as empty", () => {
    const v = valuesFromAudition(aud());
    expect(v.project).toBe("Hamlet");
    expect(v.bring).toBe("");
    expect(fromLocalInput(v.when)).toBe("2026-10-12T18:30:00.000Z");
  });

  it("reads a self-tape's date from due_at", () => {
    const v = valuesFromAudition(aud({ kind: "self_tape", starts_at: null, due_at: "2026-10-15T23:00:00Z" }));
    expect(fromLocalInput(v.when)).toBe("2026-10-15T23:00:00.000Z");
  });
});

describe("patchFromValues", () => {
  it("sends nothing when nothing changed, even with seconds on the stored time", () => {
    const a = aud();
    expect(patchFromValues(a, valuesFromAudition(a))).toEqual({});
  });

  it("sends only the changed fields, never status, reminders or tz", () => {
    const a = aud();
    const patch = patchFromValues(a, { ...valuesFromAudition(a), role: "Gertrude", bring: "headshot" });
    expect(patch).toEqual({ role: "Gertrude", bring: "headshot" });
  });

  it("a moved date goes to starts_at, or due_at for a self-tape", () => {
    const a = aud();
    const when = "2026-10-14T10:00";
    expect(patchFromValues(a, { ...valuesFromAudition(a), when })).toEqual({ starts_at: fromLocalInput(when) });
    const t = aud({ kind: "self_tape", starts_at: null, due_at: "2026-10-15T23:00:00Z" });
    expect(patchFromValues(t, { ...valuesFromAudition(t), when })).toEqual({ due_at: fromLocalInput(when) });
  });

  it("switching to a self-tape moves the date across", () => {
    const a = aud();
    const v = valuesFromAudition(a);
    expect(patchFromValues(a, { ...v, kind: "self_tape" })).toEqual({
      kind: "self_tape", starts_at: null, due_at: fromLocalInput(v.when),
    });
  });

  it("clearing a field sends null, and a rewritten ask drops the stale structured read", () => {
    const a = aud();
    expect(patchFromValues(a, { ...valuesFromAudition(a), location: "" })).toEqual({ location: null });
    expect(patchFromValues(a, { ...valuesFromAudition(a), material_raw: "2 min contemporary" })).toEqual({
      material_raw: "2 min contemporary", material: null,
    });
  });
});
