/**
 * What an actor has decided about a scene, before they rehearse it.
 *
 * Two things: which part is theirs, and what the other parts sound like. Both
 * are per-scene and both live in the browser. The scene preview is where the
 * actor casts, so it writes both; the rehearsal reads them (lib/rehearsal/prefs
 * `savedPart` and `initialVoices`) and, from the preview, goes straight in.
 *
 * The voice key and its shape are UNCHANGED (`scene_partner_voices_v3`, keyed
 * by scene id, character name → voice id). Only voices the actor actually
 * picked are written; an untouched part keeps the server's default.
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

export function voiceById(id: string | null | undefined): Voice {
  return AI_VOICES.find((v) => v.id === id) ?? AI_VOICES[4]; // coral
}

/**
 * The voices a rehearsal reads with: backend/app/services/rehearsal/voices.py
 * (`_GEMINI`), the `voices` on GET /api/rehearsal/scenes/{id}. Only a
 * fallback: the preview casts from GET /api/rehearsal/scenes/{id}/voices,
 * which is the server's own list and defaults. A saved id outside the list
 * is ignored by `initialVoices`, so an old OpenAI pick ("coral") quietly
 * becomes the server's default.
 */
export const REHEARSAL_VOICES = [
  { id: "Leda", label: "Leda · youthful, bright, 20s", gender: "female" },
  { id: "Aoede", label: "Aoede · breezy, easy, 30s", gender: "female" },
  { id: "Sulafat", label: "Sulafat · warm, kind, 30s", gender: "female" },
  { id: "Kore", label: "Kore · firm, direct, 40s", gender: "female" },
  { id: "Gacrux", label: "Gacrux · mature, assured, 50s+", gender: "female" },
  { id: "Fenrir", label: "Fenrir · eager, excitable, 20s", gender: "male" },
  { id: "Puck", label: "Puck · upbeat, playful, 30s", gender: "male" },
  { id: "Achird", label: "Achird · friendly, warm, 30s", gender: "male" },
  { id: "Charon", label: "Charon · steady, low, 40s", gender: "male" },
  { id: "Algenib", label: "Algenib · gravelly, weathered, 50s+", gender: "male" },
] as const;

/** The few seconds of a voice the ▶ plays: made once by backend/scripts/make_voice_samples.py. */
export function voiceSample(voiceId: string): string {
  return `/voices/${voiceId.toLowerCase()}.mp3`;
}

export type RehearsalVoiceId = (typeof REHEARSAL_VOICES)[number]["id"];

/**
 * The server's default voice per partner (voices.default_voices), so the
 * preview shows the voice the run will use when nothing is picked: a known
 * gender takes the first unused voice of that gender, an unknown one alternates
 * female/male by position, and no two parts share a voice while the list lasts.
 */
export function defaultRehearsalVoices(
  partners: string[],
  genderOf: (name: string) => string | null | undefined,
): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  partners.forEach((name, i) => {
    const g = (genderOf(name) ?? "").toLowerCase();
    const gender = g === "female" || g === "male" ? g : i % 2 === 0 ? "female" : "male";
    const pick =
      REHEARSAL_VOICES.find((v) => v.gender === gender && !used.has(v.id)) ??
      REHEARSAL_VOICES.find((v) => !used.has(v.id)) ??
      REHEARSAL_VOICES[0];
    used.add(pick.id);
    out[name] = pick.id;
  });
  return out;
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
    /* private mode — the server's defaults still give everyone a voice */
  }
}

/**
 * The actor's own note for a partner part ("make him meaner"), per scene and
 * character, beside the voices and in the same shape. A Plus feature: the
 * server drops a note from anyone else (services/rehearsal/access
 * can_direct_partner), so a note kept here after a plan lapses is harmless.
 */
export type CharacterNotes = Record<string, string>;

const NOTE_KEY = "scene_partner_notes_v1";

export function getCharacterNotes(sceneId: number): CharacterNotes {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(NOTE_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, CharacterNotes>;
    const mine = all[String(sceneId)] ?? {};
    return Object.fromEntries(Object.entries(mine).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
  } catch {
    return {};
  }
}

export function setCharacterNote(sceneId: number, character: string, note: string): void {
  try {
    const raw = localStorage.getItem(NOTE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, CharacterNotes>) : {};
    const mine = { ...(all[String(sceneId)] ?? {}) };
    if (note.trim()) mine[character] = note; else delete mine[character];
    all[String(sceneId)] = mine;
    localStorage.setItem(NOTE_KEY, JSON.stringify(all));
  } catch {
    /* private mode: the run is voiced without the note */
  }
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

const BOOK_KEY = "scene_partner_book_v1";

/** How much of their own lines the actor reads from, per scene (lib/rehearsal/book). */
export function getBook(sceneId: number): "script" | "cues" | "off" {
  if (typeof window === "undefined") return "script";
  try {
    const raw = localStorage.getItem(BOOK_KEY);
    const book = raw ? (JSON.parse(raw) as Record<string, string>)[String(sceneId)] : null;
    return book === "cues" || book === "off" ? book : "script";
  } catch {
    return "script";
  }
}

export function setBook(sceneId: number, book: "script" | "cues" | "off"): void {
  try {
    const raw = localStorage.getItem(BOOK_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    all[String(sceneId)] = book;
    localStorage.setItem(BOOK_KEY, JSON.stringify(all));
  } catch {
    /* private mode: the choice lasts the visit */
  }
}
