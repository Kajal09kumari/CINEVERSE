/**
 * CINEVERSE Shared TypeScript Types
 *
 * Provider-neutral canonical content contracts backed by Watchmode and SQLite.
 * Maintains normalized `Movie` / `MovieDetail` views for UI components and watchlist storage.
 */

// ─── API ─────────────────────────────────────────────────────────────────

export interface ApiHealthResponse {
  status: string;
  service: string;
}

// ─── Canonical Content Contracts ──────────────────────────────────────────

export type ContentType = 'MOVIE' | 'TV_SERIES' | 'DOCUMENTARY';
export type ContentFilterType = 'ALL' | ContentType;

export interface Genre {
  id: number;
  name: string;
}

export interface GenreListResponse {
  genres: Genre[];
}

export interface StreamingSource {
  source_id: number;
  name: string;
  type: string;
  region: string;
  web_url: string | null;
  ios_url: string | null;
  android_url: string | null;
  format: string | null;
  price: number | null;
}

export interface CastMember {
  person_id: number | null;
  type: string;
  full_name: string;
  role: string | null;
  order: number | null;
  headshot_url: string | null;
}

export interface SeasonInfo {
  id: number;
  number: number | null;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  episode_count: number | null;
  poster_url: string | null;
}

export interface EpisodeInfo {
  id: number;
  name: string | null;
  season_number: number | null;
  episode_number: number | null;
  release_date: string | null;
  runtime_minutes: number | null;
  overview: string | null;
  thumbnail_url: string | null;
  sources: StreamingSource[];
}

export interface ContentSummary {
  id: number;
  watchmode_id: number | null;
  imdb_id: string | null;
  legacy_tmdb_id: number | null;
  title: string;
  original_title: string | null;
  content_type: ContentType;
  watchmode_type: string | null;
  is_documentary: boolean;
  release_year: number | null;
  release_date: string | null;
  description: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  genres: string[];
  genre_ids: number[];
  runtime: number | null;
  rating: number | null;
  rating_source: string | null;
  popularity: number | null;
  language: string | null;
  country: string | null;
  last_synced_at: string | null;
}

export interface ContentDetail extends ContentSummary {
  cast: CastMember[];
  directors: string[];
  streaming_sources: StreamingSource[];
  seasons: SeasonInfo[];
  episodes: EpisodeInfo[];
  similar_title_ids: number[];
  trailer_url: string | null;
  attribution: string;
}

export interface ContentListResponse {
  page: number;
  results: ContentSummary[];
  total_pages: number;
  total_results: number;
  source: string;
  attribution: string;
  cached: boolean;
}

export interface AvailabilityResponse {
  content_id: number;
  watchmode_id: number;
  region: string;
  sources: StreamingSource[];
  attribution: string;
}

export interface QuotaStatusResponse {
  configured: boolean;
  quota: number | null;
  quota_used: number | null;
  local_credits_recorded: number;
  cache_enabled: boolean;
}

// ─── UI Normalized Movie / Content Views ──────────────────────────────────

export interface Movie {
  id: number;
  watchmode_id?: number | null;
  imdb_id?: string | null;
  legacy_tmdb_id?: number | null;
  content_type?: ContentType;
  is_documentary?: boolean;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  genres?: string[];
  original_language: string;
  popularity?: number;
  runtime?: number | null;
  tagline?: string;
  rating_source?: string | null;
  country?: string | null;
}

export interface MovieDetail {
  id: number;
  watchmode_id: number | null;
  imdb_id: string | null;
  legacy_tmdb_id: number | null;
  content_type: ContentType;
  is_documentary: boolean;
  title: string;
  overview: string;
  tagline: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  original_language: string;
  country: string | null;
  popularity: number;
  status: string;
  budget: number;
  revenue: number;
  homepage: string | null;
  genres: Genre[];
  cast: CastMember[];
  directors: string[];
  streaming_sources: StreamingSource[];
  seasons: SeasonInfo[];
  episodes: EpisodeInfo[];
  trailer_url: string | null;
  attribution: string;
  rating_source: string | null;
  production_countries: Array<{ iso_3166_1: string; name: string }>;
  spoken_languages: Array<{
    iso_639_1: string;
    english_name: string;
    name: string;
  }>;
}

export interface MovieListResponse {
  page: number;
  results: Movie[];
  total_pages: number;
  total_results: number;
  source: string;
  attribution?: string;
  cached?: boolean;
}

export type SortOption =
  | 'popularity_desc'
  | 'rating_desc'
  | 'release_date_desc'
  | 'title_asc';

export interface DiscoverFilters {
  query?: string;
  content_type?: ContentFilterType;
  genre?: string;
  language?: string;
  year?: number;
  min_rating?: number;
  sort_by?: SortOption;
  page?: number;
  limit?: number;
}

// ─── Recommendations ──────────────────────────────────────────────────────

export interface RecommendationResult {
  movie: Movie;
  score: number;
  reason: string;
}

// ─── User ─────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface WatchlistEntry {
  id: string;
  movie_id: number;
  movie: Movie;
  added_at: string;
}

export interface ViewingHistoryEntry {
  id: string;
  movie_id: number;
  movie: Movie;
  watched_at: string;
  rating: number | null;
}
