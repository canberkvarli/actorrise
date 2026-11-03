import api from "@/lib/api";
import { trackEvent } from "@/lib/events";
import { guidedRoute, platformOf, type GuidedChoice } from "@/lib/guided-scene";
import { primeAudioContext } from "@/lib/primed-audio";

/** Which door the actor came through. Read apart in guided_scene_started. */
export type GuidedDoor = "hub" | "onboarding";

/** GET /api/rehearsal/guided: the old single scene, and the three keyed first scenes. */
export interface GuidedCatalogue {
  scene_id: number;
  character: string;
  scenes: GuidedChoice[];
}

/** The keyed first scenes (fight, flirt, confession), in the order to show them. */
export async function fetchGuidedScenes(): Promise<GuidedChoice[]> {
  const { data } = await api.get<GuidedCatalogue>("/api/rehearsal/guided");
  return (data.scenes ?? []).filter((s) => s.characters.length > 0);
}

/** Ask for the mic INSIDE the tap, so the rehearse page inherits a granted
 *  permission instead of asking again on arrival. Denied is fine: a guided
 *  run goes on without a mic (each line shown, then skipped on). The tracks
 *  are released at once; only the permission is kept. */
export async function primeMic(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* denied or unavailable: the page copes */
  }
}

/**
 * The tap on a scene's part, shared by the hub invitation and the onboarding
 * ending. MUST be called synchronously from the click handler: the audio
 * context is started before anything is awaited, or iOS refuses it.
 * Resolves to the route to push.
 */
export async function startGuidedScene(from: GuidedDoor, scene: GuidedChoice, character: string): Promise<string> {
  primeAudioContext();
  await primeMic();
  trackEvent("guided_scene_started", { platform: platformOf(navigator.userAgent), from, key: scene.key, character });
  return guidedRoute(scene.scene_id, { as: character, from });
}
