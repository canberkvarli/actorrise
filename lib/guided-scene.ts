/**
 * The guided first scene, as the hub prints it before a session exists.
 * Must agree with backend/scripts/seed_sample_script.py::seed_late and
 * backend/app/services/guided_scene.py.
 */
export const GUIDED_PARTNER = "RILEY";
export const GUIDED_ACTOR = "ALEX";
export const GUIDED_OPENING_LINE = "You're late.";
export const GUIDED_LINE_COUNT = 6;

/** "RILEY" as it reads in a sentence. */
export function titleCase(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}

export function guidedRoute(sceneId: number): string {
  return `/scenes/${sceneId}/rehearse?guided=1`;
}

export function platformOf(ua: string): "ios" | "android" | "desktop" {
  if (/iPhone|iPad/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
