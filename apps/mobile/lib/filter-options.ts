/**
 * Filter taxonomy mirrors apps/web/lib/search filter constants. If you
 * add/change a category here, also update the web side so the backend
 * receives the same param values.
 */
export const GENDER_OPTIONS = ['any', 'male', 'female', 'non-binary'] as const;
export const AGE_RANGES = ['teens', '20s', '30s', '40s', '50s', '60+'] as const;
export const EMOTIONS = ['joy', 'sadness', 'anger', 'fear', 'melancholy', 'hope'] as const;
export const TONES = [
  'dramatic',
  'comedic',
  'dark',
  'romantic',
  'philosophical',
  'contemplative',
] as const;
export const THEMES = ['love', 'death', 'betrayal', 'identity', 'power', 'revenge'] as const;
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export const MAX_DURATIONS: { label: string; seconds: number }[] = [
  { label: '1 min', seconds: 60 },
  { label: '90 sec', seconds: 90 },
  { label: '2 min', seconds: 120 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
];

export type GenderOption = (typeof GENDER_OPTIONS)[number];
export type AgeRange = (typeof AGE_RANGES)[number];
export type Emotion = (typeof EMOTIONS)[number];
export type Tone = (typeof TONES)[number];
export type Theme = (typeof THEMES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
