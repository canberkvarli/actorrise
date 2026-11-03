/**
 * The guided first scenes, as the web offers them before a session exists.
 *
 * Since 2026-11-03 the web offers the phone's three keyed scenes (A fight, A
 * flirt, A confession; backend/scripts/seed_sample_script.py::GUIDED_THREE,
 * found by backend/app/services/guided_scene.py::GUIDED_KEYS), not "Late".
 * Late stays seeded so an old `?guided=1` link with no part still opens.
 */

/** One part in a keyed scene: its name and who they are in a few words. */
export interface GuidedPart {
  name: string;
  line: string | null;
  first_line: number | null;
}

/** One keyed first scene, as GET /api/rehearsal/guided lists it. */
export interface GuidedChoice {
  key: string;
  scene_id: number;
  title: string;
  hook: string | null;
  characters: GuidedPart[];
}

/** "RILEY" as it reads in a sentence. */
export function titleCase(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}

/** The rehearse page for a guided run. `as` is the part; with none the server picks (Late's old links). */
export function guidedRoute(sceneId: number, opts: { as?: string; from?: string } = {}): string {
  const q = new URLSearchParams({ guided: "1" });
  if (opts.as) q.set("as", opts.as);
  if (opts.from) q.set("from", opts.from);
  return `/scenes/${sceneId}/rehearse?${q.toString()}`;
}

export function platformOf(ua: string): "ios" | "android" | "desktop" {
  if (/iPhone|iPad/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
