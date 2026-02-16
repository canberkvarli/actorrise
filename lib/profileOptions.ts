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

export const BUILD_OPTIONS = [
  "Slender",
  "Average",
  "Athletic",
  "Heavy",
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
