export interface ActorProfile {
  id?: number;
  user_id?: number;
  name: string;
  age_range: string;
  gender: string;
  ethnicity?: string;
  height?: string;
  build?: string;
  location: string;
  experience_level: string;
  type: string;
  training_background?: string;
  union_status: string;
  preferred_genres: string[];
  overdone_alert_sensitivity: number;
  profile_bias_enabled: boolean;
  headshot_url?: string;
}

export interface SearchPreferences {
  preferred_genres: string[];
  overdone_alert_sensitivity: number;
  profile_bias_enabled: boolean;
}

export interface Monologue {
  id: number;
  title: string;
  character_name: string;
  text: string;
  stage_directions?: string;
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
  // For compatibility with old components
  age_range?: string;
  gender?: string;
  genre?: string;
  excerpt?: string;
  full_text_url?: string;
  source_url?: string;
  relevance_score?: number;
  /** "exact_quote" | "fuzzy_quote" when this monologue is the actual quote match (e.g. Hamlet for "to be or not to be") */
  match_type?: string;
  difficulty?: string;
}

export interface SearchRequest {
  query?: string;
  profile_bias?: boolean;
  filters?: {
    age_range?: string;
    gender?: string;
    genre?: string;
    theme?: string;
    category?: string;
  };
}

export interface SearchResponse {
  results: Monologue[];
  total: number;
}



