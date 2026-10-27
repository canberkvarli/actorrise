/**
 * The whole script, built and unbuilt, in script order.
 *
 * An opened script used to list only what had been built, so a play with nine
 * scenes and one built read as a play with one scene, and the other eight were
 * behind a button ("Choose more scenes") that opened a modal. The map puts the
 * script itself on the page: every scene the quick read found, the built ones
 * as rows you can open, the rest dimmed with a box to tick.
 *
 * Pure on purpose, so the two sums that matter (which row is which scene, and
 * how many more a plan may tick) are tested without a browser.
 */

import { actRank, sceneRank, type Scene } from "./scenes";

/** One row of the map `/api/scripts/scan` and `/scene-map` return. */
export type ScannedScene = {
  index: number;
  act_label: string | null;
  scene_label: string | null;
  title: string | null;
  characters: string[];
  line_count: number;
  char_start: number;
  char_end: number;
  page_start: number | null;
  page_end: number | null;
};

/**
 * ScenePartner reads the other part, so a scene needs two speakers to build.
 * Exactly one, not fewer than two: an empty cast means the quick read could
 * not parse the layout, and the full build may still find both parts.
 */
export function isSolo(scene: Pick<ScannedScene, "characters">): boolean {
  return scene.characters.length === 1;
}

export type MapRow =
  /** On the shelf: opens. `scan` is its row in the read, when it has one. */
  | { kind: "built"; key: string; scene: Scene; scan: ScannedScene | null }
  /** Not built. `locked` says why it can't be ticked, if it can't. */
  | { kind: "open"; key: string; scan: ScannedScene; locked: "solo" | "built" | null };

export interface MapGroup {
  act: string | null;
  rows: MapRow[];
  builtCount: number;
}

/** The server's match, mirrored (app/services/script_additions.py scene_key). */
const norm = (label: string | null | undefined) =>
  (label ?? "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");

function sceneKey(act: string | null | undefined, sceneNumber: string | null | undefined) {
  if (!sceneNumber) return null;
  return `${norm(act)}\u0000${norm(sceneNumber)}`;
}

/**
 * Lay the read of the script over what is built.
 *
 * `built` is the server's answer to "which rows of this read are on the shelf",
 * matched by heading. Each of those rows takes the built scene with the same
 * act and scene label. Anything built that the read has no row for (written by
 * hand, or unlabelled) still has to appear, so it joins the end of its act, or
 * an act of its own.
 *
 * Groups come in play order by number (Act 2 before Act 10), the same order the
 * shelf has always used. A heading with no number keeps its place after the
 * act before it rather than sinking to the bottom.
 */
export function mergeSceneMap(
  scan: ScannedScene[],
  built: number[],
  scenes: Scene[],
): MapGroup[] {
  const builtRows = new Set(built);
  const unclaimed = new Map<string, Scene[]>();
  // Built scenes with no heading. The server marks an unheaded row built only
  // when the counts agree (script_additions.unlabelled_built), so they are
  // taken in order: a one-scene file's row is its one scene, not a second
  // offer of it beside itself.
  const unheaded: Scene[] = [];
  for (const scene of scenes) {
    const key = sceneKey(scene.act, scene.scene_number);
    if (!key) {
      unheaded.push(scene);
      continue;
    }
    const list = unclaimed.get(key) ?? [];
    list.push(scene);
    unclaimed.set(key, list);
  }
  const claimed = new Set<number>();

  const groups: MapGroup[] = [];
  const groupFor = (act: string | null): MapGroup => {
    const want = norm(act);
    let group = groups.find((g) => norm(g.act) === want);
    if (!group) {
      group = { act, rows: [], builtCount: 0 };
      groups.push(group);
    }
    return group;
  };

  for (const row of scan) {
    const group = groupFor(row.act_label);
    if (builtRows.has(row.index)) {
      const key = sceneKey(row.act_label, row.scene_label);
      const scene = key ? unclaimed.get(key)?.shift() : unheaded.shift();
      if (scene) {
        claimed.add(scene.id);
        group.rows.push({ kind: "built", key: `s${scene.id}`, scene, scan: row });
        group.builtCount += 1;
        continue;
      }
      // Built by the server's count but not in the scenes we hold: the list is
      // a beat behind. Say it is built rather than offer it again.
      group.rows.push({ kind: "open", key: `r${row.index}`, scan: row, locked: "built" });
      continue;
    }
    group.rows.push({
      kind: "open",
      key: `r${row.index}`,
      scan: row,
      locked: isSolo(row) ? "solo" : null,
    });
  }

  const leftovers = scenes
    .filter((s) => !claimed.has(s.id))
    .sort((a, b) => sceneRank(a.scene_number) - sceneRank(b.scene_number));
  for (const scene of leftovers) {
    const group = groupFor(scene.act ?? null);
    group.rows.push({ kind: "built", key: `s${scene.id}`, scene, scan: null });
    group.builtCount += 1;
  }

  // Stable sort on a rank that unnumbered headings inherit from the act before
  // them, so "Act 1, Interlude, Act 2" stays in that order.
  let previous = -2;
  const ranked = groups.map((group, i) => {
    const own = actRank(group.act);
    const rank = own >= 500 ? previous : own;
    previous = rank;
    return { group, rank, i };
  });
  ranked.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return ranked.map((r) => r.group);
}

/** Every row in the map, flat, in the order it is drawn. */
export function mapRows(groups: MapGroup[]): MapRow[] {
  return groups.flatMap((g) => g.rows);
}

/**
 * How many more scenes this plan may tick on this script. null is unlimited.
 *
 * `builtCount` is every scene the script holds, hand-written ones included,
 * because that is what the server counts against the allowance.
 */
export function tickRoom(limit: number | null, builtCount: number): number | null {
  if (limit == null) return null;
  return Math.max(0, limit - builtCount);
}

/**
 * Tick or untick one row.
 *
 * `overLimit` is true when the tick was refused because the plan has no room
 * left: that is the moment to show the upgrade line, not before it.
 */
export function toggleTick(
  picked: ReadonlySet<number>,
  index: number,
  room: number | null,
): { picked: Set<number>; overLimit: boolean } {
  const next = new Set(picked);
  if (next.has(index)) {
    next.delete(index);
    return { picked: next, overLimit: false };
  }
  if (room != null && next.size >= room) return { picked: next, overLimit: true };
  next.add(index);
  return { picked: next, overLimit: false };
}

/** The rows of a read the actor could tick at all, plan aside. */
export function tickableRows(groups: MapGroup[]): ScannedScene[] {
  return mapRows(groups).flatMap((r) => (r.kind === "open" && r.locked === null ? [r.scan] : []));
}
