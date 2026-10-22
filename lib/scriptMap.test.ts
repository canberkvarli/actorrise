import { describe, expect, it } from "vitest";

import type { Scene } from "./scenes";
import {
  mergeSceneMap,
  tickRoom,
  tickableRows,
  toggleTick,
  type ScannedScene,
} from "./scriptMap";

const row = (
  index: number,
  act_label: string | null,
  scene_label: string | null,
  characters: string[] = ["ANNA", "BEN"],
): ScannedScene => ({
  index,
  act_label,
  scene_label,
  title: null,
  characters,
  line_count: 20,
  char_start: index * 100,
  char_end: index * 100 + 99,
  page_start: null,
  page_end: null,
});

const scene = (id: number, act: string | null, scene_number: string | null): Scene => ({
  id,
  title: `Scene ${id}`,
  character_1_name: "ANNA",
  character_2_name: "BEN",
  line_count: 20,
  estimated_duration_seconds: 120,
  act,
  scene_number,
});

describe("mergeSceneMap", () => {
  it("puts each built scene on its own row of the read, the rest open", () => {
    const scan = [
      row(0, "Episode 1: Boundaries", "Scene 1"),
      row(1, "Episode 1: Boundaries", "Scene 2"),
      row(2, "Episode 1: Boundaries", "Scene 3"),
    ];
    const groups = mergeSceneMap(scan, [1], [scene(7, "Episode 1: Boundaries", "Scene 2")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].builtCount).toBe(1);
    expect(groups[0].rows.map((r) => r.kind)).toEqual(["open", "built", "open"]);
    const built = groups[0].rows[1];
    expect(built.kind === "built" && built.scene.id).toBe(7);
  });

  it("matches labels the way the server does, case and spacing aside", () => {
    const scan = [row(0, "ACT  ONE", "SCENE 1")];
    const groups = mergeSceneMap(scan, [0], [scene(3, "Act One", "Scene 1")]);
    expect(groups[0].rows[0].kind).toBe("built");
  });

  it("orders episodes by number, whatever order the read listed them in", () => {
    const scan = [
      row(0, "Episode 10", "Scene 1"),
      row(1, "Episode 2", "Scene 1"),
      row(2, "Episode 1", "Scene 1"),
    ];
    expect(mergeSceneMap(scan, [], []).map((g) => g.act)).toEqual([
      "Episode 1",
      "Episode 2",
      "Episode 10",
    ]);
  });

  it("keeps an unnumbered heading after the act before it", () => {
    const scan = [row(0, "Act 1", "Scene 1"), row(1, "Interlude", "Scene 1"), row(2, "Act 2", "Scene 1")];
    expect(mergeSceneMap(scan, [], []).map((g) => g.act)).toEqual(["Act 1", "Interlude", "Act 2"]);
  });

  it("still shows a built scene the read has no row for", () => {
    // Written by hand, or unlabelled: the server cannot match it, so it is not
    // in `built`, but it is on the shelf and has to be openable.
    const scan = [row(0, "Act 1", "Scene 1")];
    const groups = mergeSceneMap(scan, [], [scene(9, "Act 1", null), scene(10, "Act 3", "Scene 1")]);
    expect(groups.map((g) => g.act)).toEqual(["Act 1", "Act 3"]);
    expect(groups[0].rows.map((r) => r.kind)).toEqual(["open", "built"]);
    expect(groups[1].builtCount).toBe(1);
  });

  it("locks a one-voice scene, and a row the server says is built", () => {
    const scan = [row(0, null, "Scene 1", ["ANNA"]), row(1, null, "Scene 2"), row(2, null, "Scene 3")];
    // Row 2 is built by the server's count but its scene is not in our list yet.
    const groups = mergeSceneMap(scan, [2], []);
    const locks = groups[0].rows.map((r) => (r.kind === "open" ? r.locked : "built-row"));
    expect(locks).toEqual(["solo", null, "built"]);
    expect(tickableRows(groups).map((s) => s.index)).toEqual([1]);
  });

  it("an unbuilt row with no match is offered", () => {
    const scan = [row(0, "Act 1", "Scene 1"), row(1, "Act 1", null)];
    const groups = mergeSceneMap(scan, [], [scene(1, "Act 1", "Scene 4")]);
    expect(tickableRows(groups).map((s) => s.index)).toEqual([0, 1]);
  });
});

describe("tick allowance", () => {
  it("free with one scene built has nothing left on this script", () => {
    expect(tickRoom(1, 1)).toBe(0);
    expect(tickRoom(1, 3)).toBe(0);
  });

  it("free with nothing built may tick one", () => {
    expect(tickRoom(1, 0)).toBe(1);
  });

  it("a paid plan is unlimited", () => {
    expect(tickRoom(null, 12)).toBeNull();
  });

  it("refuses the tick past the room and says so", () => {
    const first = toggleTick(new Set(), 4, 1);
    expect([...first.picked]).toEqual([4]);
    expect(first.overLimit).toBe(false);

    const second = toggleTick(first.picked, 5, 1);
    expect([...second.picked]).toEqual([4]);
    expect(second.overLimit).toBe(true);
  });

  it("unticking is always allowed, even at the limit", () => {
    const out = toggleTick(new Set([4]), 4, 0);
    expect(out.picked.size).toBe(0);
    expect(out.overLimit).toBe(false);
  });

  it("unlimited never refuses", () => {
    let picked: Set<number> = new Set();
    for (let i = 0; i < 30; i++) picked = toggleTick(picked, i, null).picked;
    expect(picked.size).toBe(30);
  });
});
