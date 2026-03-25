import type { Monologue } from "@/types/actor";
import type { FilmTvReference } from "@/types/filmTv";
import type { QueryHighlights } from "@/lib/queryMatchHighlight";
import type { ProfileMatch } from "@/lib/profileMatch";

export type MatchReasonCategory = "score" | "emotion" | "tone" | "gender" | "theme" | "era" | "filter" | "quote" | "profile";

export interface MatchReason {
  label: string;
  category: MatchReasonCategory;
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact_quote: "Matched your exact quote",
  fuzzy_quote: "Similar to your quote",
  title_match: "Title matches your search",
  character_match: "Character matches your search",
  play_match: "Play matches your search",
};

export function computeMatchReasons(
  mono: Monologue,
  queryHighlights: QueryHighlights | undefined,
  activeFilters: Record<string, string>,
  profileMatch?: ProfileMatch,
): MatchReason[] {
  const reasons: MatchReason[] = [];

  // 1. Match type (exact quote, title, character, etc.)
  if (mono.match_type && MATCH_TYPE_LABELS[mono.match_type]) {
    reasons.push({ label: MATCH_TYPE_LABELS[mono.match_type], category: "quote" });
  }

  // 2. Relevance score
  if (mono.relevance_score != null && mono.relevance_score > 0.1) {
    const pct = Math.round(mono.relevance_score * 100);
    reasons.push({ label: `${pct}% match`, category: "score" });
  }

  // 3. Query-matched attributes
  if (queryHighlights) {
    if (queryHighlights.emotion && mono.primary_emotion?.toLowerCase() === queryHighlights.emotion) {
      reasons.push({ label: mono.primary_emotion, category: "emotion" });
    }
    if (queryHighlights.tone && mono.tone?.toLowerCase() === queryHighlights.tone) {
      reasons.push({ label: mono.tone, category: "tone" });
    }
    if (queryHighlights.gender && mono.character_gender?.toLowerCase() === queryHighlights.gender) {
      reasons.push({ label: `${mono.character_gender} character`, category: "gender" });
    }
    if (queryHighlights.category && mono.category?.toLowerCase() === queryHighlights.category) {
      reasons.push({ label: mono.category, category: "era" });
    }
    if (queryHighlights.themes && mono.themes) {
      const matchedThemes = mono.themes.filter((t) =>
        queryHighlights.themes!.includes(t.toLowerCase())
      );
      if (matchedThemes.length > 0) {
        reasons.push({ label: matchedThemes.join(", "), category: "theme" });
      }
    }
  }

  // 4. Active filter matches
  const filterChecks: Array<{ filterKey: string; friendlyLabel: string; monoValue?: string | null; cat: MatchReasonCategory }> = [
    { filterKey: "gender", friendlyLabel: "character", monoValue: mono.character_gender, cat: "gender" },
    { filterKey: "age_range", friendlyLabel: "age", monoValue: mono.character_age_range, cat: "filter" },
    { filterKey: "emotion", friendlyLabel: "emotion", monoValue: mono.primary_emotion, cat: "emotion" },
    { filterKey: "tone", friendlyLabel: "tone", monoValue: mono.tone, cat: "tone" },
    { filterKey: "category", friendlyLabel: "era", monoValue: mono.category, cat: "era" },
    { filterKey: "difficulty", friendlyLabel: "difficulty", monoValue: mono.difficulty_level, cat: "filter" },
  ];

  for (const { filterKey, friendlyLabel, monoValue, cat } of filterChecks) {
    const filterValue = activeFilters[filterKey];
    if (filterValue && monoValue && monoValue.toLowerCase() === filterValue.toLowerCase()) {
      const alreadyAdded = reasons.some(
        (r) => r.label.toLowerCase().includes(monoValue.toLowerCase())
      );
      if (!alreadyAdded) {
        reasons.push({ label: `${friendlyLabel}: ${monoValue}`, category: cat });
      }
    }
  }

  // 5. Themes (if not already shown from query match)
  if (mono.themes && mono.themes.length > 0) {
    const alreadyHasThemes = reasons.some((r) => r.category === "theme");
    if (!alreadyHasThemes) {
      reasons.push({ label: mono.themes.slice(0, 3).join(", "), category: "theme" });
    }
  }

  // 6. Profile match
  if (profileMatch && profileMatch.score >= 2 && profileMatch.reasons.length > 0) {
    for (const reason of profileMatch.reasons) {
      reasons.push({ label: reason, category: "profile" });
    }
  }

  return reasons;
}

const FILM_TV_MATCH_LABELS: Record<string, string> = {
  title_match: "Title matches your search",
  director_match: "Director matches your search",
  actor_match: "Actor matches your search",
  plot_match: "Plot matches your search",
  semantic: "Semantically related",
};

export function computeFilmTvMatchReasons(
  ref: FilmTvReference,
  query: string,
  activeFilters: Record<string, string>,
): MatchReason[] {
  const reasons: MatchReason[] = [];

  // 1. Match type
  if (ref.match_type && FILM_TV_MATCH_LABELS[ref.match_type]) {
    reasons.push({ label: FILM_TV_MATCH_LABELS[ref.match_type], category: "quote" });
  }

  // 2. Confidence score
  if (ref.confidence_score != null && ref.confidence_score > 0.1) {
    reasons.push({ label: `${Math.round(ref.confidence_score * 100)}% match`, category: "score" });
  }

  // 3. Type (movie/tv)
  if (ref.type) {
    reasons.push({ label: ref.type === "tvSeries" ? "TV Series" : "Movie", category: "era" });
  }

  // 4. Genre
  if (ref.genre && ref.genre.length > 0) {
    reasons.push({ label: ref.genre.slice(0, 3).join(", "), category: "theme" });
  }

  // 5. Active filter matches
  if (activeFilters.genre && ref.genre?.map(g => g.toLowerCase()).includes(activeFilters.genre.toLowerCase())) {
    const already = reasons.some(r => r.label.toLowerCase().includes(activeFilters.genre.toLowerCase()));
    if (!already) reasons.push({ label: `genre: ${activeFilters.genre}`, category: "filter" });
  }
  if (activeFilters.director && ref.director?.toLowerCase().includes(activeFilters.director.toLowerCase())) {
    reasons.push({ label: `Director: ${ref.director}`, category: "filter" });
  }

  return reasons;
}
