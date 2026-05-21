/**
 * Client-side profile match scoring — computes how well a monologue fits an
 * actor's profile and returns human-readable reason strings for the UI.
 *
 * Pure utility, no API calls needed. Pattern mirrors lib/queryMatchHighlight.ts.
 */

import type { Monologue } from "@/types/actor";
import type { FullProfileResponse } from "@/hooks/useDashboardData";

export interface ProfileMatch {
  score: number;      // 0–4+, higher = better fit for this actor
  reasons: string[];  // human-readable, only the first is shown on the card
}

// Maps profile preferred_genres values → monologue category values (lowercase)
const GENRE_TO_CATEGORY: Record<string, string> = {
  drama: "dramatic",
  comedy: "comedic",
  classical: "classical",
  shakespeare: "classical",
  contemporary: "contemporary",
  musical: "musical",
};

// Maps experience level → which difficulty levels are a good fit
const EXPERIENCE_DIFFICULTIES: Record<string, string[]> = {
  student: ["easy", "moderate"],
  emerging: ["moderate", "hard"],
  professional: ["moderate", "hard", "advanced"],
};

function normalizeGender(g: string | null | undefined): string {
  const s = (g ?? "").toLowerCase().trim();
  if (s === "male" || s === "man" || s === "m") return "male";
  if (s === "female" || s === "woman" || s === "f") return "female";
  return s;
}

export function computeProfileMatch(
  mono: Monologue,
  profile: FullProfileResponse | null | undefined,
): ProfileMatch {
  // Feature off or no profile
  if (!profile?.profile_bias_enabled) return { score: 0, reasons: [] };

  const hasAnyField =
    (profile.preferred_genres?.length ?? 0) > 0 ||
    !!profile.experience_level ||
    !!profile.training_background;

  if (!hasAnyField) return { score: 0, reasons: [] };

  let score = 0;
  const reasons: string[] = [];

  // --- Preferred genre vs monologue category ---
  const monoCategory = (mono.category ?? "").toLowerCase();
  const genres = profile.preferred_genres ?? [];
  const genreMatch = genres.some((g) => {
    const mapped = GENRE_TO_CATEGORY[g.toLowerCase()];
    return mapped && monoCategory.includes(mapped);
  });
  if (genreMatch) {
    score += 1;
    reasons.push("Matches your preferred genre");
  }

  // --- Experience level vs difficulty ---
  if (profile.experience_level) {
    const key = profile.experience_level.toLowerCase();
    const goodDifficulties = EXPERIENCE_DIFFICULTIES[key];
    const monoDifficulty = (mono.difficulty_level ?? "").toLowerCase();
    if (goodDifficulties && monoDifficulty && goodDifficulties.includes(monoDifficulty)) {
      score += 1;
      reasons.push("Right difficulty for your level");
    }
  }

  // --- Training background: boosts ranking but only surfaces as a reason
  //     when there's no better per-monologue match, to avoid cluttering every card ---
  if (profile.training_background) {
    score += 0.5;
    // Reason intentionally not pushed here — too generic (true for all monologues equally).
    // It surfaces in the "Matched to your profile" header instead.
  }

  // --- Gender soft signal (score only, no visible reason) ---
  if (profile.gender) {
    const actorGender = normalizeGender(profile.gender);
    const charGender = normalizeGender(mono.character_gender);
    if (actorGender && charGender && actorGender === charGender) {
      score += 0.5;
    }
  }

  return { score, reasons };
}
