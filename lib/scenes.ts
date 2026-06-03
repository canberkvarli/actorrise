/**
 * Scene model + act-grouping shared by the script detail page and the
 * /practice library panel.
 *
 * NOTE: the script *detail* response (`GET /api/scripts/:id`) returns scenes;
 * the script *list* response does not. See `UserScript & { scenes: Scene[] }`.
 */

export interface Scene {
  id: number;
  title: string;
  description?: string | null;
  character_1_name: string;
  character_2_name: string;
  line_count: number;
  estimated_duration_seconds: number;
  act?: string | null;
  scene_number?: string | null;
}

export interface ActGroup {
  act: string | null;
  scenes: Scene[];
}

/**
 * Group scenes by act in play order (Prologue → Act 1..N → Epilogue → unknown),
 * sorting scenes within each act by scene number. Scripts with no act data
 * collapse to a single unlabeled group.
 */
export function groupScenesByAct(scenes: Scene[]): ActGroup[] {
  const hasActs = scenes.some((s) => s.act);
  if (!hasActs) {
    return [{ act: null, scenes }];
  }

  const actMap = new Map<string, Scene[]>();
  for (const scene of scenes) {
    const key = scene.act ?? "__none__";
    if (!actMap.has(key)) actMap.set(key, []);
    actMap.get(key)!.push(scene);
  }

  const rank = (key: string): number => {
    const lower = key.toLowerCase();
    if (lower === "__none__") return 9999;
    if (lower.includes("prologue")) return -1;
    if (lower.includes("epilogue")) return 1000;
    const numMatch = lower.match(/act\s+(\d+)/);
    if (numMatch) return parseInt(numMatch[1]);
    const romanMatch = lower.match(/act\s+([ivxlc]+)/i);
    if (romanMatch) {
      const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
      return roman[romanMatch[1].toLowerCase()] ?? 500;
    }
    return 500;
  };

  const sceneRank = (s: Scene): number => {
    if (!s.scene_number) return 9999;
    const num = s.scene_number.match(/(\d+)/);
    return num ? parseInt(num[1]) : 9999;
  };

  return Array.from(actMap.keys())
    .sort((a, b) => rank(a) - rank(b))
    .map((key) => ({
      act: key === "__none__" ? null : key,
      scenes: actMap.get(key)!.sort((a, b) => sceneRank(a) - sceneRank(b)),
    }));
}

/** "2 min" / "45 sec" from a seconds estimate. */
export function formatSceneDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.round(seconds / 60);
  return mins >= 1 ? `${mins} min` : `${seconds} sec`;
}
