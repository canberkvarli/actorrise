/**
 * What the Curtain opens on: the part and the voices the scene preview chose
 * (lib/scenePrefs keeps them in localStorage), merged with the server's
 * defaults. Pure, so the Curtain stays a screen.
 */
import { sameCharacter, type ScenePayload } from './contract';

/** The saved primary role, if it is one of this scene's characters. Never opens the run by itself. */
export function savedPart(characters: string[], roles: string[]): string | null {
  const primary = roles[0];
  if (!primary) return null;
  return characters.find(c => sameCharacter(c, primary)) ?? null;
}

/** A character's voice when someone else is reading opposite them: the server's default, else the first voice. */
export function defaultVoice(payload: ScenePayload, character: string): string {
  for (const [actor, v] of Object.entries(payload.defaults)) {
    if (!sameCharacter(actor, character) && v[character]) return v[character];
  }
  return payload.voices[0]?.id ?? '';
}

/** Every character's starting voice: the saved one when it is an id this payload offers, else the default. */
export function initialVoices(payload: ScenePayload, saved: Record<string, string | null>): Record<string, string> {
  const known = new Set(payload.voices.map(v => v.id));
  return Object.fromEntries(payload.characters.map(c => {
    const mine = Object.entries(saved).find(([name]) => sameCharacter(name, c))?.[1];
    return [c, mine && known.has(mine) ? mine : defaultVoice(payload, c)];
  }));
}
