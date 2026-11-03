import { describe, expect, it } from "vitest";

import { newRole } from "./notebook";
import { STEPS, resumeAt } from "./prep";

const piece = { id: 1, title: "Nina", character: "Nina", play: "The Seagull", author: "Chekhov" };
const at = (n: number) => STEPS[n].kind + ("id" in STEPS[n] ? `:${(STEPS[n] as { id: string }).id}` : "");

describe("resumeAt", () => {
  it("starts at the piece, then reading, then the first unanswered question", () => {
    expect(at(resumeAt(newRole()))).toBe("piece");
    expect(at(resumeAt({ ...newRole(), piece }))).toBe("read");
    expect(at(resumeAt({ ...newRole(), piece, answers: { who: "Me." } }))).toBe("ask:before");
  });

  it("goes to the beats once the four are answered, and to the end once there are beats", () => {
    const answers = { who: "a", before: "b", want: "c", obstacle: "d" };
    expect(at(resumeAt({ ...newRole(), piece, answers }))).toBe("beats");
    const moments = [{ id: "m", label: "", note: "", point: { weight: 0, space: 0, time: 0 } }];
    expect(at(resumeAt({ ...newRole(), piece, answers, moments }))).toBe("done");
  });
});
