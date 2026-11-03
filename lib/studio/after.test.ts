import { describe, expect, it } from "vitest";

import { ASK_AFTER_MS, afterDue, cleanTakes, lastChange } from "./after";
import { newRole } from "./notebook";
import { buildCues } from "./places";

const take = (at: number, change = "") => ({ id: `t${at}`, at, kind: "audition" as const, feel: null, worked: "", change });

describe("afterDue", () => {
  const ran = 1_000_000;
  it("asks once the run is a little in the past and nothing was written since", () => {
    const r = { ...newRole("Nina"), ranAt: ran };
    expect(afterDue(r, ran + 60_000)).toBe(false); // too soon
    expect(afterDue(r, ran + ASK_AFTER_MS + 1)).toBe(true);
  });
  it("stops asking after a note, or after Not now, for that run", () => {
    const later = ran + ASK_AFTER_MS + 1;
    expect(afterDue({ ...newRole(), ranAt: ran, takes: [take(ran + 5)] }, later)).toBe(false);
    expect(afterDue({ ...newRole(), ranAt: ran, afterDismissedAt: ran }, later)).toBe(false);
    expect(afterDue({ ...newRole() }, later)).toBe(false); // never run
  });
});

describe("lastChange", () => {
  it("is the newest note that says what to change", () => {
    const r = { ...newRole(), takes: [take(3), take(2, "Slower into the second half."), take(1, "Old.")] };
    expect(lastChange(r)).toBe("Slower into the second half.");
  });
});

describe("cleanTakes", () => {
  it("keeps good notes newest first and drops junk", () => {
    const out = cleanTakes([take(1), { id: "x", at: 5, kind: "karaoke" }, take(9), null, { ...take(4), feel: "great" }]);
    expect(out.map((t) => t.at)).toEqual([9, 4, 1]);
    expect(out[1].feel).toBeNull();
  });
});

describe("Places starts from the last note", () => {
  it("puts what you'd change right after the breath", () => {
    const r = { ...newRole(), takes: [take(1, "Don't rush the turn.")] };
    const cues = buildCues(r);
    expect(cues[1]).toMatchObject({ kind: "answer", ask: "Last time you said you'd change", text: "Don't rush the turn." });
  });
});
