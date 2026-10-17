import api from "@/lib/api";
import { trackEvent } from "@/lib/events";
import { guidedRoute, platformOf } from "@/lib/guided-scene";

/** Which door the actor came through. Read apart in guided_scene_started. */
export type GuidedDoor = "hub" | "onboarding";

/** The guided scene's id. Stable on prod (937) but fetched, never hard-coded. */
export async function fetchGuidedSceneId(): Promise<number> {
  const { data } = await api.get<{ scene_id: number; character: string }>("/api/rehearsal/guided");
  return data.scene_id;
}

/** Ask for the mic INSIDE the tap, so the rehearse page inherits a granted
 *  permission instead of asking again on arrival. Denied is fine: the page
 *  falls back to tap mode. The tracks are released at once; only the
 *  permission is kept. */
export async function primeMic(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* denied or unavailable: the page copes */
  }
}

/**
 * The Answer tap, shared by the hub invitation and the onboarding ending.
 * Resolves to the route to push. Throws when the scene cannot be found so the
 * caller can say "that didn't start".
 */
export async function startGuidedScene(from: GuidedDoor, knownId?: number | null): Promise<string> {
  await primeMic();
  const id = knownId ?? (await fetchGuidedSceneId());
  trackEvent("guided_scene_started", { platform: platformOf(navigator.userAgent), from });
  return guidedRoute(id);
}
