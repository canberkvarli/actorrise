import type { Monologue } from "@/types/actor";
import type { QueryHighlights } from "@/lib/queryMatchHighlight";
import type { ProfileMatch } from "@/lib/profileMatch";

export interface MatchReason {
  label: string;
  type: "match" | "profile";
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
    reasons.push({ label: MATCH_TYPE_LABELS[mono.match_type], type: "match" });
  }

  // 2. Relevance score
  if (mono.relevance_score != null && mono.relevance_score > 0.1) {
    const pct = Math.round(mono.relevance_score * 100);
    reasons.push({ label: `${pct}% match to your search`, type: "match" });
  }

  // 3. Query-matched attributes
  if (queryHighlights) {
    if (queryHighlights.emotion && mono.primary_emotion?.toLowerCase() === queryHighlights.emotion) {
      reasons.push({ label: `Emotion: ${mono.primary_emotion}`, type: "match" });
    }
    if (queryHighlights.tone && mono.tone?.toLowerCase() === queryHighlights.tone) {
      reasons.push({ label: `Tone: ${mono.tone}`, type: "match" });
    }
    if (queryHighlights.gender && mono.character_gender?.toLowerCase() === queryHighlights.gender) {
      reasons.push({ label: `${mono.character_gender} character`, type: "match" });
    }
    if (queryHighlights.category && mono.category?.toLowerCase() === queryHighlights.category) {
      reasons.push({ label: `${mono.category} era`, type: "match" });
    }
    if (queryHighlights.themes && mono.themes) {
      const matchedThemes = mono.themes.filter((t) =>
        queryHighlights.themes!.includes(t.toLowerCase())
      );
      if (matchedThemes.length > 0) {
        reasons.push({ label: `About ${matchedThemes.join(", ")}`, type: "match" });
      }
    }
  }

  // 4. Active filter matches
  const filterChecks: Array<{ filterKey: string; friendlyLabel: string; monoValue?: string | null }> = [
    { filterKey: "gender", friendlyLabel: "character", monoValue: mono.character_gender },
    { filterKey: "age_range", friendlyLabel: "age", monoValue: mono.character_age_range },
    { filterKey: "emotion", friendlyLabel: "emotion", monoValue: mono.primary_emotion },
    { filterKey: "tone", friendlyLabel: "tone", monoValue: mono.tone },
    { filterKey: "category", friendlyLabel: "era", monoValue: mono.category },
    { filterKey: "difficulty", friendlyLabel: "difficulty", monoValue: mono.difficulty_level },
  ];

  for (const { filterKey, friendlyLabel, monoValue } of filterChecks) {
    const filterValue = activeFilters[filterKey];
    if (filterValue && monoValue && monoValue.toLowerCase() === filterValue.toLowerCase()) {
      const alreadyAdded = reasons.some(
        (r) => r.label.toLowerCase().includes(monoValue.toLowerCase())
      );
      if (!alreadyAdded) {
        reasons.push({ label: `Matches your ${friendlyLabel} filter`, type: "match" });
      }
    }
  }

  // 5. Themes (if not already shown from query match)
  if (mono.themes && mono.themes.length > 0) {
    const alreadyHasThemes = reasons.some((r) => r.label.startsWith("About "));
    if (!alreadyHasThemes) {
      reasons.push({ label: `About ${mono.themes.slice(0, 3).join(", ")}`, type: "match" });
    }
  }

  // 6. Profile match
  if (profileMatch && profileMatch.score >= 2 && profileMatch.reasons.length > 0) {
    for (const reason of profileMatch.reasons) {
      reasons.push({ label: reason, type: "profile" });
    }
  }

  return reasons;
}
