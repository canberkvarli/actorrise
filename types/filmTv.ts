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
