/**
 * Mirror of apps/web/types/actor.ts Monologue. Web is the source of truth —
 * regenerate / sync this file whenever the backend response shape changes.
 */
export interface Monologue {
  id: number;
  title: string;
  character_name: string;
  text: string;
  stage_directions?: string;
  text_segments?: Array<{
    type: 'dialogue' | 'interjection' | 'direction';
    speaker?: string;
    text: string;
  }>;
  play_title: string;
  play_id: number;
  author: string;
  category: string;
  character_gender?: string;
  character_age_range?: string;
  primary_emotion?: string;
  emotion_scores?: Record<string, number>;
  themes?: string[];
  tone?: string;
  difficulty_level?: string;
  word_count: number;
  estimated_duration_seconds: number;
  view_count: number;
  favorite_count: number;
  is_favorited: boolean;
  overdone_score: number;
  scene_description?: string;
  age_range?: string;
  gender?: string;
  genre?: string;
  excerpt?: string;
  full_text_url?: string;
  source_url?: string;
  relevance_score?: number;
  /** "exact_quote" | "fuzzy_quote" | "title_match" | "character_match" | "play_match" */
  match_type?: string;
  difficulty?: string;
  source_type?: string | null;
  poster_url?: string | null;
  imdb_rating?: number | null;
  imdb_id?: string | null;
  director?: string | null;
}

export interface SearchResponse {
  results: Monologue[];
  total: number;
}

export interface SearchFilters {
  q?: string;
  gender?: string;
  age_range?: string;
  emotion?: string;
  tone?: string;
  theme?: string;
  difficulty?: string;
  category?: string;
  author?: string;
  max_duration?: number;
  overdone_max?: number;
  limit?: number;
  offset?: number;
}
