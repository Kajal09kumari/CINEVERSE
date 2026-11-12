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
  region?: string;
  page?: number;
  limit?: number;
}

// ─── Library, Preferences & Feedback ─────────────────────────────────────

export interface PersistedWatchlistItem {
  id?: number | null;
  content_id: number;
  title: string;
  content_type: ContentType;
  poster_url: string | null;
  release_year: number | null;
  rating: number | null;
  genres: string[];
  is_documentary: boolean;
  added_at: string | null;
}

export interface CollectionItem {
  content_id: number;
  title: string;
  content_type: ContentType;
  poster_url: string | null;
  release_year: number | null;
  rating: number | null;
  genres: string[];
  is_documentary: boolean;
  added_at: string | null;
}

export interface Collection {
  id: number;
  name: string;
  description: string;
  created_at: string;
  item_count: number;
  items: CollectionItem[];
}

export interface UserRatingEntry {
  content_id: number;
  rating: number;
  rated_at: string;
  title?: string | null;
  content_type?: string | null;
  poster_url?: string | null;
  release_year?: number | null;
  genres?: string[];
}

export interface UserPreferences {
  user_id: string;
  preferred_genres: string[];
  disliked_genres: string[];
  preferred_types: string[];
  preferred_languages: string[];
  min_rating: number | null;
  favorite_themes: string[];
  preferred_era: string;
  onboarding_completed: boolean;
  discovery_openness: number;
  updated_at: string | null;
}

export type FeedbackType =
  | 'like'
  | 'dislike'
  | 'not_interested'
  | 'already_watched'
  | 'more_like_this'
  | 'less_like_this';

export type InteractionType = 'viewed' | 'progress' | 'mira_clicked';

export interface InteractionRecord {
  id: number | null;
  user_id: string;
  content_id: number | null;
  movielens_movie_id: number | null;
  title: string;
  content_type: string;
  genres: string[];
  interaction_type: string;
  progress_pct: number;
  created_at: string;
}

export interface GenreAffinityItem {
  genre: string;
  score: number;
  signal_count: number;
}

export interface PersonAffinityItem {
  name: string;
  role: 'director' | 'actor';
  score: number;
  titles: string[];
}

export interface LanguageShareItem {
  language: string;
  count: number;
}

export interface ReleaseYearPreference {
  average_year: number | null;
  min_year: number | null;
  max_year: number | null;
  label: string;
}

export interface TasteDnaProfile {
  user_id: string;
  has_sufficient_data: boolean;
  onboarding_completed: boolean;
  signal_summary: Record<string, number>;
  top_genres: string[];
  genre_affinity_scores: GenreAffinityItem[];
  disliked_genres: string[];
  preferred_content_types: string[];
  content_type_breakdown: Record<string, number>;
  preferred_languages: string[];
  language_breakdown: LanguageShareItem[];
  favorite_actors: PersonAffinityItem[];
  favorite_directors: PersonAffinityItem[];
  favorite_themes: string[];
  release_year_preference: ReleaseYearPreference;
  average_user_rating: number | null;
  discovery_patterns: string[];
  preference_summary: string;
  exploration_openness: number;
  updated_at: string | null;
}

export interface HomeSectionItem {
  section_id: string;
  title: string;
  subtitle: string;
  items: RecommendedTitleCard[];
}

export interface ContinueExploringEntry {
  interaction: InteractionRecord;
  content: {
    id: number;
    title: string;
    content_type?: string;
    poster_url?: string | null;
    release_year?: number | null;
    rating?: number | null;
    genres?: string[];
  } | null;
}

export interface AdaptiveHomepageResponse {
  user_id: string;
  has_sufficient_data: boolean;
  show_onboarding: boolean;
  taste_dna_summary: string;
  top_genres: string[];
  sections: HomeSectionItem[];
  continue_exploring: ContinueExploringEntry[];
}

export interface FeedbackRecord {
  id: number;
  feedback_type: string;
  content_id: number | null;
  movielens_movie_id: number | null;
  title: string;
  reason: string;
  created_at: string;
}

// ─── Hybrid ML Recommendations & MIRA AI ─────────────────────────────────

export interface RecommendedTitleCard {
  content_id: number | null;
  movielens_id: number | null;
  imdb_id: string | null;
  title: string;
  content_type: ContentType;
  is_documentary: boolean;
  release_year: number | null;
  poster_url: string | null;
  description: string | null;
  genres: string[];
  rating: number | null;
  rating_source: string | null;
  runtime: number | null;
  streaming_platforms: string[];
  hybrid_score: number;
  explanation: string;
  source: string;
  community_tags: string[];
}

export interface HybridRecommendationResponse {
  mode: string;
  is_cold_start: boolean;
  dataset_stats: Record<string, number | string>;
  evaluation_metrics: Record<string, number>;
  results: RecommendedTitleCard[];
}

export interface MiraParsedConstraints {
  intent: string;
  content_type: string;
  genres: string[];
  exclude_genres: string[];
  keywords: string[];
  seed_titles: string[];
  min_rating: number | null;
  year_min: number | null;
  year_max: number | null;
  max_runtime: number | null;
  language: string | null;
  underrated: boolean;
  surprise_different: boolean;
  use_watchlist: boolean;
  region: string | null;
}

export interface MiraChatResponse {
  session_id: string;
  reply: string;
  follow_up_question: string | null;
  quick_refinements: string[];
  constraints: MiraParsedConstraints;
  recommendations: RecommendedTitleCard[];
  used_llm: boolean;
}

export interface MiraMessage {
  id?: number | null;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  constraints?: MiraParsedConstraints | null;
  recommendations: RecommendedTitleCard[];
  follow_up_question?: string | null;
  quick_refinements: string[];
}

export interface MiraSessionHistoryResponse {
  session_id: string;
  user_id: string;
  state: Record<string, unknown>;
  messages: MiraMessage[];
}

// ─── Recommendations (Legacy alias) ──────────────────────────────────────

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
