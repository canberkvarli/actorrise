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

  // 2. Relevance score — natural language, not "100% match"
  if (mono.relevance_score != null && mono.relevance_score > 0.1) {
    const pct = Math.round(mono.relevance_score * 100);
    if (pct >= 90) {
      reasons.push({ label: "Strong match to your search", category: "score" });
    } else if (pct >= 70) {
      reasons.push({ label: "Good match to your search", category: "score" });
    } else if (pct >= 50) {
      reasons.push({ label: "Related to your search", category: "score" });
    }
  }

  // 3. Gender match — tell the actor we heard them
  const searchedGender = queryHighlights?.gender || activeFilters.gender;
  if (searchedGender && mono.character_gender?.toLowerCase() === searchedGender.toLowerCase()) {
    reasons.push({ label: `${mono.character_gender} role, as requested`, category: "gender" });
  }

  // 4. Age range match
  const searchedAge = queryHighlights?.age_range || activeFilters.age_range;
  if (searchedAge && mono.character_age_range) {
    if (mono.character_age_range.toLowerCase() === searchedAge.toLowerCase()) {
      reasons.push({ label: `Age range: ${mono.character_age_range}`, category: "filter" });
    }
  } else if (mono.character_age_range && mono.character_age_range !== "any") {
    // Show age even if not searched — useful context
    reasons.push({ label: `Written for ${mono.character_age_range}`, category: "filter" });
  }

  // 5. Emotion match
  if (queryHighlights?.emotion && mono.primary_emotion?.toLowerCase() === queryHighlights.emotion) {
    reasons.push({ label: `${mono.primary_emotion} — the vibe you searched for`, category: "emotion" });
  } else if (mono.primary_emotion && mono.primary_emotion !== "unknown") {
    // Show emotion as context even without match
    reasons.push({ label: mono.primary_emotion, category: "emotion" });
  }

  // 6. Tone match
  if (queryHighlights?.tone && mono.tone?.toLowerCase() === queryHighlights.tone) {
    reasons.push({ label: `${mono.tone} tone, like you asked`, category: "tone" });
  }

  // 7. Era/category match
  if (queryHighlights?.category && mono.category?.toLowerCase() === queryHighlights.category) {
    reasons.push({ label: `${mono.category} piece`, category: "era" });
  }

  // 8. Theme matches from search
  if (queryHighlights?.themes && mono.themes) {
    const matchedThemes = mono.themes.filter((t) =>
      queryHighlights.themes!.includes(t.toLowerCase())
    );
    if (matchedThemes.length > 0) {
      reasons.push({ label: `About ${matchedThemes.join(" & ")}`, category: "theme" });
    }
  }

  // 9. UI filter matches (only if not already covered above)
  const filterChecks: Array<{ filterKey: string; monoValue?: string | null; cat: MatchReasonCategory }> = [
    { filterKey: "emotion", monoValue: mono.primary_emotion, cat: "emotion" },
    { filterKey: "tone", monoValue: mono.tone, cat: "tone" },
    { filterKey: "difficulty", monoValue: mono.difficulty_level, cat: "filter" },
  ];

  for (const { filterKey, monoValue, cat } of filterChecks) {
    const filterValue = activeFilters[filterKey];
    if (filterValue && monoValue && monoValue.toLowerCase() === filterValue.toLowerCase()) {
      const alreadyAdded = reasons.some((r) => r.category === cat);
      if (!alreadyAdded) {
        reasons.push({ label: `Matches your ${filterKey} filter`, category: cat });
      }
    }
  }

  // 10. Profile match — tell them how it fits their profile
  if (profileMatch && profileMatch.score >= 1.5 && profileMatch.reasons.length > 0) {
    for (const reason of profileMatch.reasons) {
      reasons.push({ label: reason, category: "profile" });
    }
  }

  // 11. Remaining themes as context (if we have few specific reasons)
  const specificReasons = reasons.filter(r => r.category !== "score" && r.category !== "emotion");
  if (specificReasons.length < 2 && mono.themes && mono.themes.length > 0) {
    const alreadyMentioned = new Set(reasons.map(r => r.label.toLowerCase()));
    for (const theme of mono.themes.slice(0, 3)) {
      if (!alreadyMentioned.has(theme.toLowerCase())) {
        reasons.push({ label: theme, category: "theme" });
      }
    }
  }

  // 12. Duration context
  if (mono.estimated_duration_seconds) {
    const mins = Math.floor(mono.estimated_duration_seconds / 60);
    const secs = mono.estimated_duration_seconds % 60;
    if (mins >= 2) {
      reasons.push({ label: `${mins}:${secs.toString().padStart(2, "0")} — a longer piece`, category: "filter" });
    } else if (mins === 0 && secs < 45) {
      reasons.push({ label: "Quick piece, under a minute", category: "filter" });
    }
  }

  return reasons;
}

export function computeFilmTvMatchReasons(
  ref: FilmTvReference,
  query: string,
  activeFilters: Record<string, string>,
): MatchReason[] {
  const reasons: MatchReason[] = [];

  if (ref.match_type && MATCH_TYPE_LABELS[ref.match_type]) {
    reasons.push({ label: MATCH_TYPE_LABELS[ref.match_type], category: "quote" });
  }

  if (ref.confidence_score != null && ref.confidence_score > 0.1) {
    reasons.push({ label: `${Math.round(ref.confidence_score * 100)}% match`, category: "score" });
  }

  if (ref.type) {
    reasons.push({ label: ref.type === "tvSeries" ? "TV Series" : "Movie", category: "era" });
  }

  if (ref.genre && ref.genre.length > 0) {
    reasons.push({ label: ref.genre.slice(0, 3).join(", "), category: "theme" });
  }

  if (activeFilters.genre && ref.genre?.map(g => g.toLowerCase()).includes(activeFilters.genre.toLowerCase())) {
    const already = reasons.some(r => r.label.toLowerCase().includes(activeFilters.genre.toLowerCase()));
    if (!already) reasons.push({ label: `genre: ${activeFilters.genre}`, category: "filter" });
  }
  if (activeFilters.director && ref.director?.toLowerCase().includes(activeFilters.director.toLowerCase())) {
    reasons.push({ label: `Director: ${ref.director}`, category: "filter" });
  }

  return reasons;
}
