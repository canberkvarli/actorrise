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
