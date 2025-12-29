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
  comfort_with_difficult_material: string;
  overdone_alert_sensitivity: number;
  profile_bias_enabled: boolean;
  headshot_url?: string;
}

export interface SearchPreferences {
  preferred_genres: string[];
  comfort_with_difficult_material: string;
  overdone_alert_sensitivity: number;
  profile_bias_enabled: boolean;
}

export interface Monologue {
  id: number;
  title: string;
  author: string;
  age_range: string;
  gender: string;
  genre: string;
  difficulty: string;
  excerpt: string;
  full_text_url?: string;
  source_url?: string;
  relevance_score?: number;
}

export interface SearchRequest {
  query?: string;
  profile_bias?: boolean;
  filters?: {
    age_range?: string;
    gender?: string;
    genre?: string;
    difficulty?: string;
  };
}

export interface SearchResponse {
  results: Monologue[];
  total: number;
}


