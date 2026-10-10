import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Read-only anon client for the PUBLIC monologue catalog powering the SEO pages.
 * `monologues` and `plays` have RLS disabled, so the anon key can read them.
 * No auth/session — this is catalog data, not user data.
 */
function db() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface PublicMonologue {
  id: number;
  character: string;
  playId: number | null;
  playTitle: string | null;
  author: string | null;
  copyrightStatus: string;
  sourceType: string;
  /** plays.category: "classical" | "contemporary", when set. */
  era: string | null;
  gender: string | null;
  ageRange: string | null;
  durationSeconds: number | null;
  tone: string | null;
  primaryEmotion: string | null;
  themes: string[];
  /** One or two sentences on what happens in the speech, from the ingest. */
  sceneDescription: string | null;
  /** "From Argo (2012), directed by Ben Affleck", from the ingest. */
  characterDescription: string | null;
  text: string;
  /** Only public-domain play text is published in full; everything else is teaser-only. */
  isPublicDomain: boolean;
}

/**
 * Character names from the film and TV ingest arrive as the script printed
 * them, in capitals: 270 live rows read "LADY BIRD". A page titled "LADY BIRD
 * Monologue" shouts in a search result, so an all-caps name is title-cased
 * for display. Mixed-case names are left exactly as stored.
 */
export function displayCharacter(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3 || letters !== letters.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s\-'’.(])([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase())
    .replace(/\b(Mc|Mac)([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase());
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-|-$/g, "");
}

/** Keyword-rich canonical slug. The trailing -<id> is how we resolve it back. */
export function monologueSlug(m: { id: number; character: string; playTitle: string | null }): string {
  const parts = [slugify(m.character || "monologue") || "monologue", "monologue"];
  const play = m.playTitle ? slugify(m.playTitle) : "";
  if (play) parts.push("from", play);
  return `${parts.join("-")}-${m.id}`;
}

export function idFromSlug(slug: string): number | null {
  const match = slug.match(/-(\d+)$/);
  return match ? Number(match[1]) : null;
}

type MonologueRow = {
  id: number;
  play_id: number | null;
  character_name: string | null;
  text: string | null;
  character_gender: string | null;
  character_age_range: string | null;
  estimated_duration_seconds: number | null;
  tone: string | null;
  primary_emotion: string | null;
  themes: string[] | null;
  scene_description: string | null;
  character_description: string | null;
  plays: { title: string | null; author: string | null; copyright_status: string; source_type: string; category: string | null } | null;
};

const PUBLIC_SELECT =
  "id, play_id, character_name, text, character_gender, character_age_range, estimated_duration_seconds, tone, primary_emotion, themes, scene_description, character_description, plays(title, author, copyright_status, source_type, category)";

function toPublic(row: MonologueRow): PublicMonologue | null {
  if (!row.text || !row.plays) return null;
  // Never publish user-uploaded content publicly.
  if (row.plays.copyright_status === "user_uploaded") return null;
  const clean = (s: string | null | undefined) => {
    const t = (s || "").replace(/\s+/g, " ").trim();
    return t ? t : null;
  };
  return {
    id: row.id,
    character: displayCharacter(row.character_name?.trim() || "Monologue"),
    playId: row.play_id ?? null,
    playTitle: row.plays.title?.trim() || null,
    author: row.plays.author?.trim() || null,
    copyrightStatus: row.plays.copyright_status,
    sourceType: row.plays.source_type,
    era: row.plays.category || null,
    gender: row.character_gender || null,
    ageRange: row.character_age_range || null,
    durationSeconds: row.estimated_duration_seconds ?? null,
    tone: row.tone || null,
    primaryEmotion: row.primary_emotion || null,
    themes: Array.isArray(row.themes) ? row.themes.filter((t) => typeof t === "string" && t.trim()) : [],
    sceneDescription: clean(row.scene_description),
    characterDescription: clean(row.character_description),
    text: row.text,
    isPublicDomain: row.plays.copyright_status === "public_domain",
  };
}

export async function getPublicMonologue(id: number): Promise<PublicMonologue | null> {
  const { data, error } = await db().from("monologues").select(PUBLIC_SELECT).eq("id", id).maybeSingle();
  const row = data as MonologueRow | null;
  if (error || !row) return null;
  return toPublic(row);
}

export interface SiblingMonologue {
  id: number;
  character: string;
  playTitle: string | null;
  tone: string | null;
  durationSeconds: number | null;
}

/**
 * Other speeches from the same play or show, best-rated first, for the
 * "More from" block on a piece page. Until 2026-10-10 a piece page linked to
 * no other /monologues/ page at all; 12,000 pages were reachable only from
 * the sitemap and passed nothing to each other. Runs once per page build.
 */
export async function getSiblingMonologues(playId: number, excludeId: number, limit = 6): Promise<SiblingMonologue[]> {
  const { data, error } = await db()
    .from("monologues")
    .select("id, character_name, estimated_duration_seconds, tone, plays!inner(title, copyright_status)")
    .eq("play_id", playId)
    .neq("id", excludeId)
    .neq("plays.copyright_status", "user_uploaded")
    .not("text", "is", null)
    .is("review_status", null)
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as { id: number; character_name: string | null; estimated_duration_seconds: number | null; tone: string | null; plays: { title: string | null } | null }[]).map((r) => ({
    id: r.id,
    character: displayCharacter(r.character_name?.trim() || "Monologue"),
    playTitle: r.plays?.title?.trim() || null,
    tone: r.tone || null,
    durationSeconds: r.estimated_duration_seconds ?? null,
  }));
}

/**
 * When a monologue id from an old crawled URL no longer exists (purged as a dup, too-short,
 * or bad-extraction row), look for a live monologue with the same character + play, parsed
 * straight out of the dead slug's own text. Data-quality purges routinely leave a "sibling"
 * row behind under a different id, so this turns what would be a dead end into a 301 instead
 * of losing whatever search equity the old URL had.
 */
export async function findReplacementMonologue(slug: string): Promise<PublicMonologue | null> {
  const withoutId = slug.replace(/-\d+$/, "");
  const fromMarker = "-monologue-from-";
  const fromIdx = withoutId.indexOf(fromMarker);
  const characterSlug = fromIdx !== -1 ? withoutId.slice(0, fromIdx) : withoutId.replace(/-monologue$/, "");
  const playSlug = fromIdx !== -1 ? withoutId.slice(fromIdx + fromMarker.length) : null;
  if (!characterSlug) return null;

  const { data, error } = await db()
    .from("monologues")
    .select(PUBLIC_SELECT)
    .ilike("character_name", characterSlug.replace(/-/g, " "))
    .not("text", "is", null)
    .order("id", { ascending: false })
    .limit(20);
  if (error || !data) return null;

  const rows = data as unknown as MonologueRow[];
  const match = rows.find((r) => {
    if (!r.character_name || slugify(r.character_name) !== characterSlug) return false;
    if (!r.plays || r.plays.copyright_status === "user_uploaded") return false;
    if (playSlug && slugify(r.plays.title || "") !== playSlug) return false;
    return true;
  });
  if (!match) return null;
  return toPublic(match);
}

export interface CollectionMonologue {
  id: number;
  character: string;
  playTitle: string | null;
  author: string | null;
  sourceType: string;
  gender: string | null;
  tone: string | null;
  durationSeconds: number | null;
  isPublicDomain: boolean;
  /** First ~180 characters, public-domain pieces only. Copyrighted text is never excerpted. */
  teaser: string | null;
}

type CollectionRow = {
  id: number;
  character_name: string | null;
  text: string | null;
  character_gender: string | null;
  estimated_duration_seconds: number | null;
  tone: string | null;
  plays: { title: string | null; author: string | null; copyright_status: string; source_type: string; category: string | null } | null;
};

function teaserOf(text: string | null): string | null {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= 180) return t;
  const cut = t.slice(0, 180);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 120))}…`;
}

/**
 * The pieces behind one keyword collection page (lib/monologueCollections.ts).
 * Best-rated first, so the top of the page is the strongest shelf, then stable
 * by id so the page does not reshuffle between crawls.
 */
export async function getCollectionMonologues(
  filters: {
    gender?: "female" | "male";
    tones?: string[];
    era?: "classical" | "contemporary";
    maxSeconds?: number;
    ages?: string[];
    sources?: string[];
    /** Exact `plays.title` values: one play or show, under every title it is stored as. */
    plays?: string[];
    /** `monologues.themes` tags (a text array); any of these. */
    themes?: string[];
  },
  limit = 30,
): Promise<CollectionMonologue[]> {
  let q = db()
    .from("monologues")
    .select(
      "id, character_name, text, character_gender, estimated_duration_seconds, tone, plays!inner(title, author, copyright_status, source_type, category)",
    )
    .neq("plays.copyright_status", "user_uploaded")
    .not("text", "is", null)
    .is("review_status", null);
  if (filters.gender) q = q.eq("character_gender", filters.gender);
  if (filters.tones?.length) q = q.in("tone", filters.tones);
  if (filters.era) q = q.eq("plays.category", filters.era);
  if (filters.maxSeconds) q = q.lte("estimated_duration_seconds", filters.maxSeconds).gt("estimated_duration_seconds", 0);
  if (filters.ages?.length) q = q.in("character_age_range", filters.ages);
  if (filters.sources?.length) q = q.in("plays.source_type", filters.sources);
  if (filters.plays?.length) q = q.in("plays.title", filters.plays);
  // `overlaps` is PostgREST's `ov` (&&): a piece tagged with any of the themes.
  if (filters.themes?.length) q = q.overlaps("themes", filters.themes);
  const { data, error } = await q
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as CollectionRow[])
    .filter((r) => r.plays && r.text)
    .map((r) => {
      const pd = r.plays!.copyright_status === "public_domain";
      return {
        id: r.id,
        character: displayCharacter(r.character_name?.trim() || "Monologue"),
        playTitle: r.plays!.title?.trim() || null,
        author: r.plays!.author?.trim() || null,
        sourceType: r.plays!.source_type,
        gender: r.character_gender || null,
        tone: r.tone || null,
        durationSeconds: r.estimated_duration_seconds ?? null,
        isPublicDomain: pd,
        teaser: pd ? teaserOf(r.text) : null,
      };
    });
}

export interface CorpusStats {
  pieces: number;
  plays: number;
  film: number;
  tv: number;
  publicDomain: number;
  underTwoMinutes: number;
  women: number;
  men: number;
  /** ISO date of the newest piece, or null if the count query failed. */
  lastAdded: string | null;
}

/**
 * The library's size, for the pages that state it (/monologue-database).
 * Eight head-only counts and one row; the page that calls this revalidates
 * weekly, so it is eight Supabase reads a week, not per hit. A count that
 * fails returns 0 rather than throwing, and the page prints nothing for it.
 */
export async function getCorpusStats(): Promise<CorpusStats> {
  const client = db();
  const live = () =>
    client
      .from("monologues")
      .select("id, plays!inner(copyright_status, source_type)", { count: "exact", head: true })
      .neq("plays.copyright_status", "user_uploaded")
      .not("text", "is", null)
      .is("review_status", null);
  const n = async (q: ReturnType<typeof live>) => {
    const { count, error } = await q;
    return error || count == null ? 0 : count;
  };
  const [pieces, plays, film, tv, publicDomain, underTwoMinutes, women, men, newest] = await Promise.all([
    n(live()),
    n(live().eq("plays.source_type", "play")),
    n(live().eq("plays.source_type", "film")),
    n(live().eq("plays.source_type", "tv")),
    n(live().eq("plays.copyright_status", "public_domain")),
    n(live().lte("estimated_duration_seconds", 120).gt("estimated_duration_seconds", 0)),
    n(live().eq("character_gender", "female")),
    n(live().eq("character_gender", "male")),
    client
      .from("monologues")
      .select("created_at, plays!inner(copyright_status)")
      .neq("plays.copyright_status", "user_uploaded")
      .is("review_status", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const row = newest.data?.[0] as { created_at?: string } | undefined;
  return {
    pieces,
    plays,
    film,
    tv,
    publicDomain,
    underTwoMinutes,
    women,
    men,
    lastAdded: row?.created_at ? row.created_at.slice(0, 10) : null,
  };
}

/** Ids + slug fields for the sitemap (excludes user-uploaded). Paginated past the 1k row cap. */
export async function getIndexableMonologues(
  max = 12000,
): Promise<{ id: number; character: string; playTitle: string | null }[]> {
  const client = db();
  const pageSize = 1000;
  const out: { id: number; character: string; playTitle: string | null }[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await client
      .from("monologues")
      .select("id, character_name, plays!inner(title, copyright_status)")
      .neq("plays.copyright_status", "user_uploaded")
      .not("text", "is", null)
      // Retired rows (review_status 'too_short' / 'not_monologue' / 'pending')
      // return in no search and are thin pages. Submitting ~6.4k of them was
      // asking Google to index content the product itself declines to serve.
      .is("review_status", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const d of data as unknown as { id: number; character_name: string | null; plays: { title: string | null } | null }[]) {
      out.push({ id: d.id, character: d.character_name?.trim() || "monologue", playTitle: d.plays?.title?.trim() || null });
    }
    if (data.length < pageSize) break;
  }
  return out;
}
