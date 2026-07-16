export interface Credit {
  id: number;
  category: string; // theatre | film | tv | commercial | other
  production: string;
  role?: string | null;
  company?: string | null;
  director?: string | null;
  year?: string | null;
  sort_order: number;
}

export interface CreditInput {
  category: string;
  production: string;
  role?: string;
  company?: string;
  director?: string;
  year?: string;
}

// Order here drives the section order on the résumé.
// Order here drives the résumé section order (theatre-first, the NY/stage default).
export const CREDIT_CATEGORIES: { id: string; label: string; heading: string }[] = [
  { id: "theatre", label: "Theatre", heading: "Theatre" },
  { id: "film", label: "Film", heading: "Film" },
  { id: "tv", label: "TV", heading: "Television" },
  { id: "commercial", label: "Commercial", heading: "Commercials" },
  { id: "voiceover", label: "Voiceover", heading: "Voiceover" },
  { id: "other", label: "Other", heading: "New Media & Other" },
];

export const CATEGORY_HEADING: Record<string, string> = Object.fromEntries(
  CREDIT_CATEGORIES.map((c) => [c.id, c.heading])
);
