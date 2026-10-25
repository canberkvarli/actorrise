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
};

export type ShareableScene = {
  scene_id: number;
  title: string;
  script_title: string;
  characters: ShelfCharacter[];
  duration_seconds: number | null;
  line_count: number | null;
  tone: string | null;
  description: string | null;
  already_shared: boolean;
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
export function shelfQuery(filters: ShelfFilters, offset = 0): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.trim()) params.set(key, value.trim());
  }
  if (offset) params.set("offset", String(offset));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** One line under the title: where it comes from. */
export function sourceLine(scene: Pick<ShelfScene, "work_title" | "author" | "work_kind" | "where">): string {
  const kind = scene.work_kind === "film" ? "film" : scene.work_kind === "tv" ? "TV" : null;
  const work = kind ? `${scene.work_title} (${kind})` : scene.work_title;
  return [work, scene.author, scene.where].filter(Boolean).join(" · ");
}
