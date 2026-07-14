/**
 * Shared profile option constants for the actor profile form.
 * Use these for dropdowns, toggles, and multi-selects.
 */

export const LOCATIONS = [
  "NYC",
  "LA",
  "San Francisco",
  "Chicago",
  "Atlanta",
  "Boston",
  "Seattle",
  "Regional",
  "Other",
] as const;

export const EXPERIENCE_LEVELS = [
  { id: "Student", label: "Student", description: "Just starting" },
  { id: "Emerging", label: "Emerging", description: "Some training" },
  { id: "Professional", label: "Professional", description: "Working actor" },
] as const;

export const ACTOR_TYPE_IDS = ["theater", "film", "voice", "student", "other"] as const;
export const ACTOR_TYPE_LABELS: Record<string, string> = {
  theater: "Theater",
  film: "Film & TV",
  voice: "Voice",
  student: "Student",
  other: "Other",
};

export const GENDERS = ["Male", "Female", "Non-binary", "Other"] as const;

export const AGE_RANGES = ["18-25", "25-35", "35-45", "45-55", "55+"] as const;

export const HEIGHT_FEET = [4, 5, 6, 7, 8] as const;
export const HEIGHT_INCHES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export const BUILD_OPTIONS = [
  "Slender",
  "Medium",
  "Athletic",
  "Curvy",
  "Other",
] as const;

export const UNION_STATUSES = ["Non-union", "SAG-E", "SAG", "Other"] as const;

export const CHARACTER_TYPES = [
  "Leading Man/Woman",
  "Character Actor",
  "Ingénue",
  "Comic",
  "Other",
] as const;

export const PREFERRED_GENRES = [
  "Drama",
  "Comedy",
  "Classical",
  "Contemporary",
  "Musical",
  "Shakespeare",
] as const;

// --- Profile-first onboarding (5-tap) -------------------------------------
// These drive the onboarding wizard AND map to real monologue search filters.

// Tap 3 — "What do you want to work on?" (multi). `kind` says whether the choice
// filters by the monologue's tone or by the play's era (category).
export const WORK_ON = [
  { id: "dramatic", label: "Dramatic", kind: "tone", genre: "Drama" },
  { id: "comedic", label: "Comedic", kind: "tone", genre: "Comedy" },
  { id: "classical", label: "Classical", kind: "era", genre: "Classical" },
  { id: "contemporary", label: "Contemporary", kind: "era", genre: "Contemporary" },
] as const;

// Tap 4 — "Which mediums?" (multi). `sourceType` matches Play.source_type.
export const MEDIUMS = [
  { id: "theatre", label: "Theatre", sourceType: "play" },
  { id: "film", label: "Film", sourceType: "film" },
  { id: "tv", label: "TV", sourceType: "tv" },
] as const;

// Tap 5 — "Where are you in it?" (single). Maps to experience_level + the
// overdone-sensitivity bias (beginners tolerate warhorses, pros want fresh).
export const CAREER_STAGES = [
  { id: "just_starting", label: "Just starting", experienceLevel: "Student", overdoneSensitivity: 0.2 },
  { id: "auditioning", label: "Actively auditioning", experienceLevel: "Emerging", overdoneSensitivity: 0.5 },
  { id: "working_pro", label: "Working pro", experienceLevel: "Professional", overdoneSensitivity: 0.8 },
] as const;

// How the actor is usually cast (single) — stored to profile.gender using the
// canonical GENDERS values, shown with casting-friendly labels.
export const CASTING = [
  { id: "Male", label: "Men's roles", searchGender: "male" },
  { id: "Female", label: "Women's roles", searchGender: "female" },
  { id: "Non-binary", label: "Non-binary", searchGender: "non-binary" },
  { id: "Other", label: "Any / other", searchGender: "" },
] as const;

export const TRAINING_BACKGROUND_OPTIONS = [
  "BFA",
  "MFA",
  "Conservatory",
  "Studio training",
  "University / College",
  "Other",
] as const;

export const ETHNICITY_OPTIONS = [
  "Asian",
  "Black",
  "Hispanic / Latine",
  "Indigenous",
  "Middle Eastern",
  "White",
  "Multiracial",
  "Other",
] as const;

export type Location = (typeof LOCATIONS)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]["id"];
export type ActorTypeId = (typeof ACTOR_TYPE_IDS)[number];
export type Gender = (typeof GENDERS)[number];
export type AgeRange = (typeof AGE_RANGES)[number];
export type Build = (typeof BUILD_OPTIONS)[number];
export type UnionStatus = (typeof UNION_STATUSES)[number];
export type CharacterType = (typeof CHARACTER_TYPES)[number];
export type PreferredGenre = (typeof PREFERRED_GENRES)[number];
export type WorkOnId = (typeof WORK_ON)[number]["id"];
export type MediumId = (typeof MEDIUMS)[number]["id"];
export type CareerStageId = (typeof CAREER_STAGES)[number]["id"];
export type CastingId = (typeof CASTING)[number]["id"];
