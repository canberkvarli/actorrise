/**
 * Pure derivations from the 5-tap onboarding answers into (a) the profile write
 * payload and (b) the monologue-search params for the personalized payoff.
 *
 * Kept dependency-free so the mapping is easy to reason about and change.
 * NOTE: the /api/monologues/search endpoint exposes gender, age_range,
 * source_type, category, exclude_overdone (no `tone`), so dramatic/comedic taps
 * shape personalization via profile-bias `preferred_genres`, not a hard filter.
 */

import { CASTING, WORK_ON, MEDIUMS, CAREER_STAGES } from "./profileOptions";

export interface OnboardingAnswers {
  casting: string | null; // CASTING id == canonical GENDERS value
  ageRange: string | null; // AGE_RANGES value, e.g. "25-35"
  workOn: string[]; // WORK_ON ids (multi)
  mediums: string[]; // MEDIUMS ids (multi)
  stage: string | null; // CAREER_STAGES id
}

export interface ProfileWrite {
  gender?: string;
  age_range?: string;
  type: string[];
  preferred_genres: string[];
  preferred_mediums: string[];
  experience_level?: string;
  overdone_alert_sensitivity: number;
  profile_bias_enabled: boolean;
}

/** Answers -> body for PUT /api/profile. */
export function buildProfileWrite(a: OnboardingAnswers): ProfileWrite {
  const stage = CAREER_STAGES.find((s) => s.id === a.stage);
  const preferred_genres = WORK_ON.filter((w) => a.workOn.includes(w.id)).map((w) => w.genre);
  // Actor "type" mirrors chosen mediums for profile coherence (theatre->theater,
  // film/tv->film), de-duped.
  const type = Array.from(
    new Set(a.mediums.map((m) => (m === "theatre" ? "theater" : "film")))
  );
  return {
    ...(a.casting ? { gender: a.casting } : {}),
    ...(a.ageRange ? { age_range: a.ageRange } : {}),
    type,
    preferred_genres,
    preferred_mediums: a.mediums,
    ...(stage ? { experience_level: stage.experienceLevel } : {}),
    overdone_alert_sensitivity: stage ? stage.overdoneSensitivity : 0.5,
    profile_bias_enabled: true,
  };
}

/**
 * Answers -> query string for GET /api/monologues/search (no `q` => discover
 * with filters). `broad` drops the narrowing filters (era/source) for the
 * thin-results fallback so we never show a blank payoff.
 */
export function buildPayoffParams(a: OnboardingAnswers, opts?: { limit?: number; broad?: boolean }): string {
  const p = new URLSearchParams();
  const cast = CASTING.find((c) => c.id === a.casting);
  if (cast?.searchGender) p.set("gender", cast.searchGender);
  if (a.ageRange) p.set("age_range", a.ageRange);

  if (!opts?.broad) {
    const sources = MEDIUMS.filter((m) => a.mediums.includes(m.id)).map((m) => m.sourceType);
    if (sources.length) p.set("source_type", sources.join(","));
    // `category` is single-valued; only send it when the actor picked exactly one era.
    const eras = WORK_ON.filter((w) => a.workOn.includes(w.id) && w.kind === "era").map((w) => w.id);
    if (eras.length === 1) p.set("category", eras[0]);
  }

  // Working pros get fresh material by default; everyone else keeps warhorses in play.
  if (a.stage === "working_pro") p.set("exclude_overdone", "true");
  p.set("limit", String(opts?.limit ?? 3));
  return p.toString();
}

/** Plain-language summary for the payoff header, e.g. "for women's roles, 25–35". */
export function describeAnswers(a: OnboardingAnswers): string {
  const bits: string[] = [];
  const cast = CASTING.find((c) => c.id === a.casting);
  if (cast && cast.id !== "Other") bits.push(cast.label.toLowerCase());
  if (a.ageRange) bits.push(a.ageRange.replace("-", "–"));
  const stage = CAREER_STAGES.find((s) => s.id === a.stage);
  if (stage) bits.push(stage.label.toLowerCase());
  return bits.join(", ");
}
