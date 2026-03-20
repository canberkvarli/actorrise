import type { Monologue } from "@/types/actor";
import type { QueryHighlights } from "@/lib/queryMatchHighlight";
import type { ProfileMatch } from "@/lib/profileMatch";

export interface MatchReason {
  label: string;
  detail: string;
  type: "query" | "filter" | "ai" | "profile";
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact_quote: "Exact quote match",
  fuzzy_quote: "Close quote match",
  title_match: "Title match",
  character_match: "Character name match",
  play_match: "Play title match",
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
    reasons.push({
      label: MATCH_TYPE_LABELS[mono.match_type],
      detail: MATCH_TYPE_LABELS[mono.match_type],
      type: "ai",
    });
  }

  // 2. AI relevance score
  if (mono.relevance_score != null && mono.relevance_score > 0.1) {
    const pct = Math.round(mono.relevance_score * 100);
    reasons.push({
      label: `${pct}% match`,
      detail: `AI relevance: ${pct}%`,
      type: "ai",
    });
  }

  // 3. Query keyword matches (from queryHighlights)
  if (queryHighlights) {
    if (queryHighlights.emotion && mono.primary_emotion?.toLowerCase() === queryHighlights.emotion) {
      reasons.push({
        label: mono.primary_emotion,
        detail: `Query matched emotion: ${mono.primary_emotion}`,
        type: "query",
      });
    }
    if (queryHighlights.tone && mono.tone?.toLowerCase() === queryHighlights.tone) {
      reasons.push({
        label: mono.tone,
        detail: `Query matched tone: ${mono.tone}`,
        type: "query",
      });
    }
    if (queryHighlights.gender && mono.character_gender?.toLowerCase() === queryHighlights.gender) {
      reasons.push({
        label: mono.character_gender,
        detail: `Query matched gender: ${mono.character_gender}`,
        type: "query",
      });
    }
    if (queryHighlights.category && mono.category?.toLowerCase() === queryHighlights.category) {
      reasons.push({
        label: mono.category,
        detail: `Query matched era: ${mono.category}`,
        type: "query",
      });
    }
    if (queryHighlights.themes && mono.themes) {
      const matchedThemes = mono.themes.filter((t) =>
        queryHighlights.themes!.includes(t.toLowerCase())
      );
      if (matchedThemes.length > 0) {
        reasons.push({
          label: matchedThemes.join(", "),
          detail: `Query matched themes: ${matchedThemes.join(", ")}`,
          type: "query",
        });
      }
    }
  }

  // 4. Active filter matches
  const filterChecks: Array<{ filterKey: string; filterLabel: string; monoValue?: string | null }> = [
    { filterKey: "gender", filterLabel: "Gender", monoValue: mono.character_gender },
    { filterKey: "age_range", filterLabel: "Age", monoValue: mono.character_age_range },
    { filterKey: "emotion", filterLabel: "Emotion", monoValue: mono.primary_emotion },
    { filterKey: "tone", filterLabel: "Tone", monoValue: mono.tone },
    { filterKey: "category", filterLabel: "Category", monoValue: mono.category },
    { filterKey: "difficulty", filterLabel: "Difficulty", monoValue: mono.difficulty_level },
  ];

  for (const { filterKey, filterLabel, monoValue } of filterChecks) {
    const filterValue = activeFilters[filterKey];
    if (filterValue && monoValue && monoValue.toLowerCase() === filterValue.toLowerCase()) {
      // Avoid duplicate if already added as query match
      const alreadyAdded = reasons.some(
        (r) => r.type === "query" && r.label.toLowerCase() === monoValue.toLowerCase()
      );
      if (!alreadyAdded) {
        reasons.push({
          label: `${filterLabel}: ${monoValue}`,
          detail: `Filter: ${filterLabel.toLowerCase()} = ${monoValue}`,
          type: "filter",
        });
      }
    }
  }

  // 5. Themes (show in tooltip even if not matched by query/filter)
  if (mono.themes && mono.themes.length > 0) {
    const alreadyHasThemes = reasons.some((r) => r.detail.startsWith("Query matched themes"));
    if (!alreadyHasThemes) {
      reasons.push({
        label: `Themes: ${mono.themes.slice(0, 3).join(", ")}`,
        detail: `Themes: ${mono.themes.slice(0, 3).join(", ")}`,
        type: "ai",
      });
    }
  }

  // 6. Profile match reasons
  if (profileMatch && profileMatch.score >= 2 && profileMatch.reasons.length > 0) {
    for (const reason of profileMatch.reasons) {
      reasons.push({
        label: reason,
        detail: reason,
        type: "profile",
      });
    }
  }

  return reasons;
}
