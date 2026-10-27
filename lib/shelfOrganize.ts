/**
 * The ScenePartner shelf, organised for an actor with hundreds of scripts: a
 * teacher who brought in a folder of 500 sides, a student whose shelf fills
 * from the Community library. Pure, so the rules are tested without a render.
 */

export interface ShelfScript {
  id: number;
  title: string;
  author?: string | null;
  is_sample?: boolean;
  file_type?: string;
  original_filename?: string;
  created_at?: string;
  scene_titles?: string[];
  characters?: Array<{ name?: string }>;
}

export type ShelfSort = "mine" | "recent" | "az";

/** Past this many, a section shows its first few and a "show all", and the
 *  shelf grows a search box. Twelve-ish fits the rail beside the stage. */
export const SHELF_PAGE = 8;

/** Where a script came from. A Community library copy is a script the actor
 *  owns (api/shelf.py), filed as file_type "shelf". */
export function splitShelf<T extends ShelfScript>(scripts: T[]) {
  const own: T[] = [];
  const community: T[] = [];
  const house: T[] = [];
  for (const s of scripts) {
    if (s.is_sample) house.push(s);
    else if (s.file_type === "shelf" || s.original_filename?.startsWith("shelf-")) community.push(s);
    else own.push(s);
  }
  return { own, community, house };
}

export function matchesShelf(script: ShelfScript, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    script.title,
    script.author ?? "",
    ...(script.scene_titles ?? []),
    ...(script.characters ?? []).map((c) => c.name ?? ""),
  ];
  return hay.some((h) => h.toLowerCase().includes(q));
}

/** "mine" keeps the order given (the actor's own arrangement). */
export function sortShelf<T extends ShelfScript>(scripts: T[], sort: ShelfSort): T[] {
  if (sort === "mine") return scripts;
  const out = [...scripts];
  if (sort === "az") out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  else out.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return out;
}

function titleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export type ShelfEntry<T> = { kind: "one"; script: T } | { kind: "group"; title: string; scripts: T[] };

/** Scripts that share a title are one entry: twelve files typed up from one
 *  film read as that film, not twelve rows of the same name. The entry sits
 *  where its first script does, so the actor's order still holds. */
export function groupShelf<T extends ShelfScript>(scripts: T[]): ShelfEntry<T>[] {
  const byKey = new Map<string, T[]>();
  for (const s of scripts) {
    const k = titleKey(s.title);
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }
  const seen = new Set<string>();
  const out: ShelfEntry<T>[] = [];
  for (const s of scripts) {
    const k = titleKey(s.title);
    if (seen.has(k)) continue;
    seen.add(k);
    const all = byKey.get(k)!;
    out.push(all.length > 1 ? { kind: "group", title: s.title, scripts: all } : { kind: "one", script: s });
  }
  return out;
}
