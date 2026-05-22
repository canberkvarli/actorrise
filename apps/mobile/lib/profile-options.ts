/**
 * Mirror of apps/web/lib/profileOptions.ts. If web adds an option, add
 * it here too — the backend rejects unknown values.
 */

export const AGE_RANGES = ['18-25', '25-35', '35-45', '45-55', '55+'] as const;

export const GENDERS = ['Male', 'Female', 'Non-binary', 'Other'] as const;

export const ETHNICITIES = [
  'Asian',
  'Black',
  'Hispanic / Latine',
  'Indigenous',
  'Middle Eastern',
  'White',
  'Multiracial',
  'Other',
] as const;

export const BUILDS = ['Slender', 'Medium', 'Athletic', 'Curvy', 'Other'] as const;

export const LOCATIONS = [
  'NYC',
  'LA',
  'San Francisco',
  'Chicago',
  'Atlanta',
  'Boston',
  'Seattle',
  'Regional',
  'Other',
] as const;

export const ACTOR_TYPES = ['theater', 'film', 'voice', 'student', 'other'] as const;

export const EXPERIENCE_LEVELS = [
  { value: 'Student', helper: 'Just starting' },
  { value: 'Emerging', helper: 'Some training' },
  { value: 'Professional', helper: 'Working actor' },
] as const;

export const TRAINING_BACKGROUNDS = [
  'BFA',
  'MFA',
  'Conservatory',
  'Studio training',
  'University / College',
  'Other',
] as const;

export const UNION_STATUSES = ['Non-union', 'SAG-E', 'SAG', 'Other'] as const;

export const PREFERRED_GENRES = [
  'Drama',
  'Comedy',
  'Classical',
  'Contemporary',
  'Musical',
  'Shakespeare',
] as const;

export const HEIGHT_FEET = [4, 5, 6, 7] as const;
export const HEIGHT_INCHES = Array.from({ length: 12 }, (_, i) => i);
