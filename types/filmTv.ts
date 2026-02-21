/** Film/TV reference — IMDb/OMDb-seeded metadata for audition prep. */

export interface FilmTvReference {
  id: number;
  title: string;
  year: number | null;
  type: string | null;          // "movie" | "tvSeries"
  genre: string[] | null;
  plot_snippet: string | null;  // ≤300 chars, for card display
  plot: string | null;          // full plot, for detail panel
  director: string | null;
  actors: string[] | null;
  imdb_rating: number | null;
  poster_url: string | null;
  imdb_id: string;
  imsdb_url: string | null;
  confidence_score: number | null;
  is_best_match: boolean;
}

export interface FilmTvSearchResponse {
  results: FilmTvReference[];
  total: number;
  page: number;
  page_size: number;
}

/** Film/TV monologue — a single monologue from a film or TV reference (for search results). */
export interface FilmTvMonologue {
  character_name: string;
  source_title: string;
  source_type?: string | null; // "film" | "tv_series"
  source_year?: number | null;
  actor_name?: string | null;
  character_gender?: string | null;
  character_age_range?: string | null;
  primary_emotion?: string | null;
  difficulty_level?: string | null;
  tone?: string[] | null;
  themes?: string[] | null;
  scene_description?: string | null;
  description?: string | null;
  estimated_duration_seconds?: number | null;
  word_count_approx?: number | null;
  script_url?: string | null;
  youtube_url?: string | null;
}
