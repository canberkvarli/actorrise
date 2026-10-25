/* The scene shelf (backend/app/api/shelf.py): types and the small readings
   every card makes. Kept apart from the components so they can be tested. */

export type ShelfCharacter = { name: string; gender: string | null; age: string | null };

export type ShelfScene = {
  id: number;
  kind: "public_domain" | "shared";
  status: "live" | "hidden";
  title: string;
  description: string | null;
  work_title: string;
  work_kind: "play" | "film" | "tv";
  author: string | null;
  year: number | null;
  era: "classical" | "modern" | null;
  where: string | null;
  characters: ShelfCharacter[];
  duration_seconds: number | null;
  line_count: number | null;
  tone: string | null;
  open_count: number;
  shared_by: string | null;
  is_mine: boolean;
  /** The viewer's copy of a classic, as a script on their shelf. */
  on_my_shelf: number | null;
};

/** What has been asked of one of the actor's scenes (shelf.py, /shareable). */
export type ShareAsk = null | "shared" | "declined" | "done_asking";

export type ShareableScene = {
  scene_id: number;
  script_id: number;
  title: string;
  script_title: string;
  script_author: string | null;
  /** "Act 2, Scene 3" off the script's own headings; "" when it has none. */
  where_guess: string;
  characters: ShelfCharacter[];
  duration_seconds: number | null;
  line_count: number | null;
  tone: string | null;
  description: string | null;
  already_shared: boolean;
  ask: ShareAsk;
  shelf_id: number | null;
  open_count: number;
  finished: boolean;
};

export type ShelfFilters = {
  pairing?: "mf" | "ff" | "mm";
  age?: string;
  length?: "short" | "medium" | "long";
  tone?: string;
  era?: "classical" | "modern";
  kind?: "public_domain" | "shared";
  q?: string;
};

export const TONES = ["dramatic", "comedic", "romantic", "tense", "tragic", "playful"] as const;
export const AGES = ["teens", "20s", "30s", "40s", "50s+"] as const;

/** "2:45" for 165 seconds; empty when unknown. */
export function formatLength(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SHORT_GENDER: Record<string, string> = { male: "M", female: "F" };

/** "Nora (F, 30s)": who the part is, in as few characters as the card has. */
export function describeCharacter(c: ShelfCharacter): string {
  const bits = [c.gender ? SHORT_GENDER[c.gender] : undefined, c.age && c.age !== "any" ? c.age : undefined]
    .filter(Boolean)
    .join(", ");
  return bits ? `${c.name} (${bits})` : c.name;
}

/** The query string the list endpoint reads, empty filters left out. */
export function shelfQuery(filters: ShelfFilters, offset = 0, limit?: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.trim()) params.set(key, value.trim());
  }
  if (offset) params.set("offset", String(offset));
  if (limit) params.set("limit", String(limit));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** One line under the title: where it comes from. */
export function sourceLine(scene: Pick<ShelfScene, "work_title" | "author" | "work_kind" | "where">): string {
  const kind = scene.work_kind === "film" ? "film" : scene.work_kind === "tv" ? "TV" : null;
  const work = kind ? `${scene.work_title} (${kind})` : scene.work_title;
  return [work, scene.author, scene.where].filter(Boolean).join(" · ");
}

/**
 * The two moments ScenePartner asks an actor to share, never twice for a scene.
 *
 * At upload: every scene of the script nobody has asked about yet, as one ask.
 * After a run: one scene they said "not now" to at upload and have since run
 * to the end. Never both at once; the upload ask comes first.
 */
export function shareMoment(
  scenes: ShareableScene[],
): { kind: "upload"; scenes: ShareableScene[] } | { kind: "rehearsed"; scenes: ShareableScene[] } | null {
  const fresh = scenes.filter((s) => s.ask === null);
  if (fresh.length > 0) return { kind: "upload", scenes: fresh };
  const nudge = scenes.find((s) => s.ask === "declined" && s.finished);
  return nudge ? { kind: "rehearsed", scenes: [nudge] } : null;
}

/** Film, TV or a play, guessed from the script's headings ("Episode 3" is TV). */
export function guessWorkKind(where: string): "play" | "film" | "tv" {
  if (/\b(episode|season|ep\.?\s*\d|s\d+e\d+)/i.test(where)) return "tv";
  if (/\b(int\.|ext\.)/i.test(where)) return "film";
  return "play";
}

/** "Contributor · 12 actors opened yours", or nothing before the first share. */
export function contributorLine(mine: { contributor: boolean; opens: number } | undefined): string | null {
  if (!mine?.contributor) return null;
  const n = mine.opens;
  return n > 0 ? `Contributor · ${n} ${n === 1 ? "actor" : "actors"} opened yours` : "Contributor";
}

const PAIRING_GENDERS: Record<NonNullable<ShelfFilters["pairing"]>, [string, string]> = {
  mf: ["male", "female"],
  ff: ["female", "female"],
  mm: ["male", "male"],
};
const LENGTH_SECONDS: Record<NonNullable<ShelfFilters["length"]>, [number, number]> = {
  short: [0, 120],
  medium: [120, 210],
  long: [210, Infinity],
};

/**
 * The library's filters, in the browser. The same rules as the list endpoint
 * (backend/app/api/shelf.py list_shelf), so the whole library loads once and
 * every keystroke answers at once instead of waiting on a request.
 */
export function filterShelf(scenes: ShelfScene[], f: ShelfFilters): ShelfScene[] {
  const fits = (g: string | null, want: string) => g === want || g === "any" || g == null;
  const q = f.q?.trim().toLowerCase();
  return scenes.filter((s) => {
    const [a, b] = s.characters;
    if (f.pairing) {
      const [x, y] = PAIRING_GENDERS[f.pairing];
      if (!((fits(a?.gender ?? null, x) && fits(b?.gender ?? null, y)) || (fits(a?.gender ?? null, y) && fits(b?.gender ?? null, x)))) return false;
    }
    if (f.age && !s.characters.some((c) => c.age === f.age || c.age === "any")) return false;
    if (f.length) {
      const [lo, hi] = LENGTH_SECONDS[f.length];
      if (s.duration_seconds == null || s.duration_seconds < lo || s.duration_seconds >= hi) return false;
    }
    if (f.tone && s.tone !== f.tone) return false;
    if (f.era && s.era !== f.era) return false;
    if (f.kind && s.kind !== f.kind) return false;
    if (q) {
      const hay = [s.title, s.work_title, s.author, s.description, ...s.characters.map((c) => c.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!q.split(/\s+/).every((word) => hay.includes(word))) return false;
    }
    return true;
  });
}
