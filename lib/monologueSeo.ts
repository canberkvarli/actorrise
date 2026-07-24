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
  playTitle: string | null;
  author: string | null;
  copyrightStatus: string;
  sourceType: string;
  gender: string | null;
  durationSeconds: number | null;
  tone: string | null;
  text: string;
  /** Only public-domain play text is published in full; everything else is teaser-only. */
  isPublicDomain: boolean;
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
  character_name: string | null;
  text: string | null;
  character_gender: string | null;
  estimated_duration_seconds: number | null;
  tone: string | null;
  plays: { title: string | null; author: string | null; copyright_status: string; source_type: string } | null;
};

export async function getPublicMonologue(id: number): Promise<PublicMonologue | null> {
  const { data, error } = await db()
    .from("monologues")
    .select(
      "id, character_name, text, character_gender, estimated_duration_seconds, tone, plays(title, author, copyright_status, source_type)",
    )
    .eq("id", id)
    .maybeSingle();
  const row = data as MonologueRow | null;
  if (error || !row || !row.text || !row.plays) return null;
  // Never publish user-uploaded content publicly.
  if (row.plays.copyright_status === "user_uploaded") return null;
  return {
    id: row.id,
    character: row.character_name?.trim() || "Monologue",
    playTitle: row.plays.title?.trim() || null,
    author: row.plays.author?.trim() || null,
    copyrightStatus: row.plays.copyright_status,
    sourceType: row.plays.source_type,
    gender: row.character_gender || null,
    durationSeconds: row.estimated_duration_seconds ?? null,
    tone: row.tone || null,
    text: row.text,
    isPublicDomain: row.plays.copyright_status === "public_domain",
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
