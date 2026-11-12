/**
 * CINEVERSE Content Discovery Service
 *
 * Typed frontend client functions for all `/api/content/*` FastAPI endpoints.
 * All Watchmode credentials stay strictly server-side in FastAPI.
 */

import { apiRequest } from './api';
import type {
  AvailabilityResponse,
  ContentDetail,
  ContentFilterType,
  ContentListResponse,
  ContentSummary,
  DiscoverFilters,
  EpisodeInfo,
  Genre,
  GenreListResponse,
  Movie,
  MovieDetail,
  MovieListResponse,
  SeasonInfo,
} from '@/types';

/**
 * Verified Watchmode genre ID -> name fallback map for instant display
 * before or alongside `/api/content/genres`.
 */
export const WATCHMODE_GENRE_FALLBACK_MAP: Record<number, string> = {
  1: 'Action',
  39: 'Action & Adventure',
  2: 'Adventure',
  3: 'Animation',
  33: 'Anime',
  31: 'Biography',
  4: 'Comedy',
  5: 'Crime',
  6: 'Documentary',
  7: 'Drama',
  8: 'Family',
  9: 'Fantasy',
  10: 'History',
  11: 'Horror',
  12: 'Music',
  32: 'Musical',
  13: 'Mystery',
  36: 'Nature',
  14: 'Romance',
  40: 'Sci-Fi & Fantasy',
  15: 'Science Fiction',
  17: 'Thriller',
  38: 'TV Movie',
  18: 'War',
  41: 'War & Politics',
  19: 'Western',
};

const GENRE_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(WATCHMODE_GENRE_FALLBACK_MAP).map(([id, name]) => [
    name.toLowerCase(),
    Number(id),
  ])
);

/**
 * Maps editorial homepage mood slugs to Watchmode genre IDs and discover filters.
 */
export const MOOD_TO_DISCOVER: Record<
  string,
  {
    label: string;
    genreIds: string;
    minRating?: number;
    sortBy?: DiscoverFilters['sort_by'];
  }
> = {
  comedy: { label: 'Need a good laugh', genreIds: '4', sortBy: 'popularity_desc' },
  'mind-bending': {
    label: 'Something mind-bending',
    genreIds: '15,13',
    sortBy: 'rating_desc',
    minRating: 7,
  },
  romance: { label: 'A little romance', genreIds: '14', sortBy: 'popularity_desc' },
  dark: {
    label: 'Dark and mysterious',
    genreIds: '17,5,13',
    sortBy: 'rating_desc',
    minRating: 7,
  },
  'feel-good': {
    label: 'Feel-good stories',
    genreIds: '4,8,2',
    sortBy: 'rating_desc',
    minRating: 7,
  },
  thriller: {
    label: 'Edge-of-your-seat thrillers',
    genreIds: '17',
    sortBy: 'popularity_desc',
  },
};

export function contentSummaryToMovie(item: ContentSummary): Movie {
  const mappedGenreIds =
    item.genre_ids && item.genre_ids.length > 0
      ? item.genre_ids
      : (item.genres ?? [])
          .map((g) => GENRE_NAME_TO_ID[g.toLowerCase()])
          .filter((id): id is number => Boolean(id));

  return {
    id: item.id,
    watchmode_id: item.watchmode_id,
    imdb_id: item.imdb_id,
    legacy_tmdb_id: item.legacy_tmdb_id,
    content_type: item.content_type,
    is_documentary: item.is_documentary,
    title: item.title,
    overview: item.description ?? '',
    poster_path: item.poster_url,
    backdrop_path: item.backdrop_url,
    release_date:
      item.release_date ?? (item.release_year ? `${item.release_year}-01-01` : ''),
    vote_average: item.rating ?? 0,
    vote_count: 0,
    genre_ids: mappedGenreIds,
    genres: item.genres ?? [],
    original_language: item.language ?? '',
    popularity: item.popularity ?? 0,
    runtime: item.runtime,
    rating_source: item.rating_source,
    country: item.country,
  };
}

export function contentDetailToMovieDetail(item: ContentDetail): MovieDetail {
  const genreObjects: Genre[] =
    item.genres && item.genres.length > 0
      ? item.genres.map((name, idx) => ({
          id:
            item.genre_ids?.[idx] ??
            GENRE_NAME_TO_ID[name.toLowerCase()] ??
            idx + 1,
          name,
        }))
      : (item.genre_ids ?? []).map((id) => ({
          id,
          name: WATCHMODE_GENRE_FALLBACK_MAP[id] ?? `Genre ${id}`,
        }));

  return {
    id: item.id,
    watchmode_id: item.watchmode_id,
    imdb_id: item.imdb_id,
    legacy_tmdb_id: item.legacy_tmdb_id,
    content_type: item.content_type,
    is_documentary: item.is_documentary,
    title: item.title,
    overview: item.description ?? '',
    tagline: item.original_title && item.original_title !== item.title ? item.original_title : '',
    poster_path: item.poster_url,
    backdrop_path: item.backdrop_url,
    release_date:
      item.release_date ?? (item.release_year ? `${item.release_year}-01-01` : ''),
    runtime: item.runtime,
    vote_average: item.rating ?? 0,
    vote_count: 0,
    original_language: item.language ?? '',
    country: item.country,
    popularity: item.popularity ?? 0,
    status: item.content_type === 'TV_SERIES' ? 'Series' : item.is_documentary ? 'Documentary' : 'Released',
    budget: 0,
    revenue: 0,
    homepage: item.streaming_sources?.[0]?.web_url ?? null,
    genres: genreObjects,
    cast: item.cast ?? [],
    directors: item.directors ?? [],
    streaming_sources: item.streaming_sources ?? [],
    seasons: item.seasons ?? [],
    episodes: item.episodes ?? [],
    trailer_url: item.trailer_url,
    attribution: item.attribution,
    rating_source: item.rating_source,
    production_countries: item.country ? [{ iso_3166_1: item.country, name: item.country }] : [],
    spoken_languages: item.language
      ? [{ iso_639_1: item.language, english_name: item.language.toUpperCase(), name: item.language.toUpperCase() }]
      : [],
  };
}

function adaptListResponse(res: ContentListResponse): MovieListResponse {
  return {
    page: res.page,
    results: (res.results ?? []).map(contentSummaryToMovie),
    total_pages: res.total_pages,
    total_results: res.total_results,
    source: res.source,
    attribution: res.attribution,
    cached: res.cached,
  };
}

export async function getTrendingMovies(
  page = 1,
  contentType: ContentFilterType = 'ALL'
): Promise<MovieListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    content_type: contentType,
  });
  const res = await apiRequest<ContentListResponse>(
    `/api/content/trending?${params.toString()}`
  );
  return adaptListResponse(res);
}

export async function getPopularMovies(
  page = 1,
  contentType: ContentFilterType = 'MOVIE'
): Promise<MovieListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    content_type: contentType,
  });
  const res = await apiRequest<ContentListResponse>(
    `/api/content/popular?${params.toString()}`
  );
  return adaptListResponse(res);
}

export async function searchMovies(
  query: string,
  page = 1,
  contentType: ContentFilterType = 'ALL'
): Promise<MovieListResponse> {
  const params = new URLSearchParams({
    query: query.trim(),
    content_type: contentType,
    page: String(page),
  });
  const res = await apiRequest<ContentListResponse>(
    `/api/content/search?${params.toString()}`
  );
  return adaptListResponse(res);
}

export async function getMovieDetails(contentId: number): Promise<MovieDetail> {
  const res = await apiRequest<ContentDetail>(`/api/content/${contentId}`);
  return contentDetailToMovieDetail(res);
}

export async function resolveLegacyTmdbId(
  tmdbId: number,
  mediaType: 'movie' | 'tv' = 'movie'
): Promise<Movie> {
  const res = await apiRequest<ContentSummary>(
    `/api/content/resolve-legacy/tmdb/${tmdbId}?media_type=${mediaType}`
  );
  return contentSummaryToMovie(res);
}

export async function getContentAvailability(
  contentId: number,
  region?: string
): Promise<AvailabilityResponse> {
  const qs = region ? `?region=${encodeURIComponent(region)}` : '';
  return apiRequest<AvailabilityResponse>(`/api/content/${contentId}/availability${qs}`);
}

export async function getContentSeasons(contentId: number): Promise<SeasonInfo[]> {
  return apiRequest<SeasonInfo[]>(`/api/content/${contentId}/seasons`);
}

export async function getContentEpisodes(
  contentId: number,
  seasonNumber?: number
): Promise<EpisodeInfo[]> {
  const qs = seasonNumber !== undefined ? `?season_number=${seasonNumber}` : '';
  return apiRequest<EpisodeInfo[]>(`/api/content/${contentId}/episodes${qs}`);
}

export async function getMovieGenres(): Promise<Genre[]> {
  const res = await apiRequest<GenreListResponse>('/api/content/genres');
  return res.genres;
}

export async function getMoviesByGenre(
  genreId: number,
  page = 1,
  contentType: ContentFilterType = 'ALL'
): Promise<MovieListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    content_type: contentType,
  });
  const res = await apiRequest<ContentListResponse>(
    `/api/content/genre/${genreId}?${params.toString()}`
  );
  return adaptListResponse(res);
}

export async function discoverMovies(
  filters: DiscoverFilters = {}
): Promise<MovieListResponse> {
  const params = new URLSearchParams();

  if (filters.content_type) params.set('content_type', filters.content_type);
  if (filters.genre) params.set('genre', filters.genre);
  if (filters.language) params.set('language', filters.language);
  if (filters.year) params.set('year', String(filters.year));
  if (filters.min_rating !== undefined) {
    params.set('min_rating', String(filters.min_rating));
  }
  if (filters.sort_by) params.set('sort_by', filters.sort_by);
  params.set('page', String(filters.page ?? 1));
  if (filters.limit) params.set('limit', String(filters.limit));

  const res = await apiRequest<ContentListResponse>(
    `/api/content/discover?${params.toString()}`
  );
  return adaptListResponse(res);
}

export async function getSimilarMovies(
  contentId: number,
  page = 1
): Promise<MovieListResponse> {
  const res = await apiRequest<ContentListResponse>(
    `/api/content/${contentId}/similar?page=${page}`
  );
  return adaptListResponse(res);
}

/**
 * Convert MovieDetail into Movie summary shape (used when toggling watchlist on detail view).
 */
export function movieDetailToSummary(detail: MovieDetail): Movie {
  return {
    id: detail.id,
    watchmode_id: detail.watchmode_id,
    imdb_id: detail.imdb_id,
    legacy_tmdb_id: detail.legacy_tmdb_id,
    content_type: detail.content_type,
    is_documentary: detail.is_documentary,
    title: detail.title,
    overview: detail.overview,
    poster_path: detail.poster_path,
    backdrop_path: detail.backdrop_path,
    release_date: detail.release_date,
    vote_average: detail.vote_average,
    vote_count: detail.vote_count,
    genre_ids: detail.genres.map((g) => g.id),
    genres: detail.genres.map((g) => g.name),
    original_language: detail.original_language,
    popularity: detail.popularity,
    runtime: detail.runtime,
    tagline: detail.tagline,
    rating_source: detail.rating_source,
    country: detail.country,
  };
}

/**
 * Resolve primary genre labels from a Movie item and optional live Watchmode genre dictionary.
 */
export function resolveMovieGenres(
  movie: Movie,
  genreMap: Record<number, string> = WATCHMODE_GENRE_FALLBACK_MAP
): string[] {
  if (movie.genres && movie.genres.length > 0) return movie.genres;
  return (movie.genre_ids ?? [])
    .map((id) => genreMap[id] ?? WATCHMODE_GENRE_FALLBACK_MAP[id])
    .filter((name): name is string => Boolean(name));
}
