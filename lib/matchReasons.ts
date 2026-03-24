import type { Monologue } from "@/types/actor";
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
