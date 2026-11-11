/**
 * CINEVERSE Shared TypeScript Types
 *
 * Central location for types that are used across multiple
 * parts of the application. As the project grows, split into
 * domain-specific files: movie.ts, user.ts, recommendation.ts, etc.
 */

// ─── API ─────────────────────────────────────────────────────────────────

export interface ApiHealthResponse {
  status: string;
  project: string;
}

// ─── Movies ───────────────────────────────────────────────────────────────

export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  original_language: string;
}

export interface Genre {
  id: number;
  name: string;
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
