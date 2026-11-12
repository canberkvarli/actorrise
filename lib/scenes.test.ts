import { describe, expect, it } from "vitest";

import { groupScenesByAct, type Scene } from "./scenes";

const scene = (id: number, act: string | null, scene_number: string | null) =>
  ({ id, act, scene_number }) as unknown as Scene;

describe("groupScenesByAct", () => {
  it("puts episodes in order, whatever order the scenes were built in", () => {
    // Scenes are built in parallel, so ids come back scrambled. The shelf read
    // 1, 6, 5, 2, 3, 4 on ALMOST A THERAPIST.
    const scenes = [
      scene(1, "Episode 1: Boundaries", "Scene 2"),
      scene(2, "Episode 6", "Scene 2"),
      scene(3, "Episode 5: Passion", "Scene 2"),
      scene(4, "Episode 2: Self Identification", "Scene 2"),
      scene(5, "Episode 10", "Scene 1"),
      scene(6, "Episode 3: Empathy", "Scene 2"),
    ];
    expect(groupScenesByAct(scenes).map((g) => g.act)).toEqual([
      "Episode 1: Boundaries",
      "Episode 2: Self Identification",
      "Episode 3: Empathy",
      "Episode 5: Passion",
      "Episode 6",
      "Episode 10",
    ]);
  });

  it("orders scenes inside an episode by number, past nine", () => {
    const scenes = [
      scene(1, "Episode 1", "Scene 11"),
      scene(2, "Episode 1", "Scene 2"),
      scene(3, "Episode 1", "Scene 10"),
    ];
    expect(groupScenesByAct(scenes)[0].scenes.map((s) => s.scene_number)).toEqual([
      "Scene 2",
      "Scene 10",
      "Scene 11",
    ]);
  });
});

describe("groupScenesByAct on an arranged script", () => {
  const s = (id: number, act: string | null, script_order: number | null): Scene => ({
    id, title: `S${id}`, character_1_name: "A", character_2_name: "B", line_count: 1, estimated_duration_seconds: 60,
    act, scene_number: null, script_order,
  });
  it("keeps the actor's order and headings where they first come", () => {
    const groups = groupScenesByAct([s(1, "Act 2", 1), s(2, "Act 1", 0), s(3, "act  2", 2), s(4, "Act 1", null)]);
    expect(groups.map((g) => [g.act, g.scenes.map((x) => x.id)])).toEqual([
      ["Act 1", [2, 4]],
      ["Act 2", [1, 3]],
    ]);
  });
});
