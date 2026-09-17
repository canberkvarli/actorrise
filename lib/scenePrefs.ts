/**
 * What an actor has decided about a scene, before they rehearse it.
 *
 * Two things: which part is theirs, and what the other parts sound like. Both
 * are per-scene, both live in the browser, and both are now needed in two
 * places — the scene preview and the scene editor — so they live here instead
 * of once in each.
 *
 * The voice key and its shape are UNCHANGED (`scene_partner_voices_v3`, keyed
 * by scene id, character name → voice id). The editor has been writing it for
 * a while and the rehearsal page reads what it produces; moving the functions
 * without moving the data is the whole point.
 */

export interface Voice {
  id: string;
  label: string;
  desc: string;
  gender: "male" | "female" | "neutral";
  /** Tailwind class. Kept because the rehearsal page's avatars still take it. */
  color: string;
}

/** The voices ScenePartner can read with. */
export const AI_VOICES: readonly Voice[] = [
  { id: "ash", label: "Ash", desc: "Warm, deep", gender: "male", color: "bg-blue-600" },
  { id: "echo", label: "Echo", desc: "Smooth, neutral", gender: "male", color: "bg-blue-500" },
  { id: "fable", label: "Fable", desc: "Expressive, British", gender: "male", color: "bg-indigo-500" },
  { id: "onyx", label: "Onyx", desc: "Deep, authoritative", gender: "male", color: "bg-blue-800" },
  { id: "coral", label: "Coral", desc: "Warm, expressive", gender: "female", color: "bg-rose-500" },
  { id: "nova", label: "Nova", desc: "Bright, energetic", gender: "female", color: "bg-pink-500" },
  { id: "sage", label: "Sage", desc: "Calm, measured", gender: "female", color: "bg-rose-600" },
  { id: "shimmer", label: "Shimmer", desc: "Light, youthful", gender: "female", color: "bg-pink-400" },
  { id: "alloy", label: "Alloy", desc: "Balanced, clear", gender: "neutral", color: "bg-slate-500" },
  { id: "ballad", label: "Ballad", desc: "Melodic, theatrical", gender: "neutral", color: "bg-violet-600" },
] as const;

/** Handed out in order, so two characters in one scene never start alike. */
export const DEFAULT_VOICE_CYCLE = [
  "coral", "ash", "ballad", "sage", "onyx", "nova", "fable", "shimmer", "alloy", "echo",
];

export function voiceById(id: string | null | undefined): Voice {
  return AI_VOICES.find((v) => v.id === id) ?? AI_VOICES[4]; // coral
}

/** character name → voice id */
export type CharacterVoices = Record<string, string | null>;

const VOICE_KEY = "scene_partner_voices_v3";
const ROLE_KEY = "scene_partner_roles_v1";

export function getCharacterVoices(sceneId: number): CharacterVoices {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(VOICE_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, CharacterVoices>;
    return all[String(sceneId)] ?? {};
  } catch {
    return {};
  }
}

export function setCharacterVoices(sceneId: number, voices: CharacterVoices): void {
  try {
    const raw = localStorage.getItem(VOICE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, CharacterVoices>) : {};
    all[String(sceneId)] = voices;
    localStorage.setItem(VOICE_KEY, JSON.stringify(all));
  } catch {
    /* private mode — the defaults below still give everyone a voice */
  }
}

/**
 * Fill in anyone who has not been cast yet, without disturbing a choice the
 * actor made. Returns a complete map for the characters given.
 */
export function withDefaultVoices(
  cast: string[],
  chosen: CharacterVoices,
): Record<string, string> {
  const out: Record<string, string> = {};
  let next = 0;
  for (const name of cast) {
    const picked = chosen[name];
    if (picked) {
      out[name] = picked;
      continue;
    }
    out[name] = DEFAULT_VOICE_CYCLE[next % DEFAULT_VOICE_CYCLE.length];
    next += 1;
  }
  return out;
}

/**
 * Which parts are the actor's, in this scene.
 *
 * New. The editor kept this in component state only, so every visit opened
 * with nothing selected and "Please select a character first" was the first
 * thing a returning actor met on a scene they had already rehearsed twice.
 * First entry is the primary role, matching `user_character` on the session.
 */
export function getMyRoles(sceneId: number): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, string[]>;
    const roles = all[String(sceneId)];
    return Array.isArray(roles) ? roles.filter((r) => typeof r === "string") : [];
  } catch {
    return [];
  }
}

export function setMyRoles(sceneId: number, roles: string[]): void {
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    all[String(sceneId)] = roles;
    localStorage.setItem(ROLE_KEY, JSON.stringify(all));
  } catch {
    /* private mode — the preview falls back to the first character */
  }
}
