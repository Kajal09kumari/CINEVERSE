/**
 * CINEVERSE Library, Collections, Ratings & Preferences Client Service
 */

import { apiRequest } from './api';
import type {
  Collection,
  Movie,
  PersistedWatchlistItem,
  UserPreferences,
  UserRatingEntry,
} from '@/types';
import { releaseYear } from '@/lib/utils';

const DEFAULT_USER = 'local-default';

export async function fetchWatchlist(userId = DEFAULT_USER): Promise<PersistedWatchlistItem[]> {
  const res = await apiRequest<{ user_id: string; total: number; items: PersistedWatchlistItem[] }>(
    `/api/library/watchlist?user_id=${encodeURIComponent(userId)}`
  );
  return res.items;
}

export async function saveWatchlistItem(movie: Movie, userId = DEFAULT_USER): Promise<PersistedWatchlistItem> {
  const yr = releaseYear(movie.release_date);
  return apiRequest<PersistedWatchlistItem>(
    `/api/library/watchlist?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        content_id: movie.id,
        title: movie.title,
        content_type: movie.content_type ?? 'MOVIE',
        poster_url: movie.poster_path,
        release_year: /^\d{4}$/.test(yr) ? Number(yr) : null,
        rating: movie.vote_average > 0 ? movie.vote_average : null,
        legacy_tmdb_id: movie.legacy_tmdb_id ?? null,
      }),
    }
  );
}

export async function syncWatchlistBulk(movies: Movie[], userId = DEFAULT_USER): Promise<PersistedWatchlistItem[]> {
  const payload = movies.map((movie) => {
    const yr = releaseYear(movie.release_date);
    return {
      content_id: movie.id,
      title: movie.title,
      content_type: movie.content_type ?? 'MOVIE',
      poster_url: movie.poster_path,
      release_year: /^\d{4}$/.test(yr) ? Number(yr) : null,
      rating: movie.vote_average > 0 ? movie.vote_average : null,
      legacy_tmdb_id: movie.legacy_tmdb_id ?? null,
    };
  });
  const res = await apiRequest<{ items: PersistedWatchlistItem[] }>(
    `/api/library/watchlist/sync?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ items: payload }),
    }
  );
  return res.items;
}

export async function deleteWatchlistItem(contentId: number, userId = DEFAULT_USER): Promise<void> {
  await apiRequest<{ removed: boolean }>(
    `/api/library/watchlist/${contentId}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}

export async function clearRemoteWatchlist(userId = DEFAULT_USER): Promise<void> {
  await apiRequest<{ deleted: number }>(
    `/api/library/watchlist?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}

export async function fetchCollections(userId = DEFAULT_USER): Promise<Collection[]> {
  const res = await apiRequest<{ collections: Collection[] }>(
    `/api/library/collections?user_id=${encodeURIComponent(userId)}`
  );
  return res.collections;
}

export async function createCollection(
  name: string,
  description = '',
  userId = DEFAULT_USER
): Promise<Collection> {
  return apiRequest<Collection>(
    `/api/library/collections?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }
  );
}

export async function deleteCollection(collectionId: number, userId = DEFAULT_USER): Promise<void> {
  await apiRequest<{ deleted: boolean }>(
    `/api/library/collections/${collectionId}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}

export async function addToCollection(
  collectionId: number,
  contentId: number,
  userId = DEFAULT_USER
): Promise<void> {
  await apiRequest<{ added: boolean }>(
    `/api/library/collections/${collectionId}/items?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ content_id: contentId }),
    }
  );
}

export async function removeFromCollection(
  collectionId: number,
  contentId: number,
  userId = DEFAULT_USER
): Promise<void> {
  await apiRequest<{ removed: boolean }>(
    `/api/library/collections/${collectionId}/items/${contentId}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}

export async function fetchUserRatings(userId = DEFAULT_USER): Promise<UserRatingEntry[]> {
  return apiRequest<UserRatingEntry[]>(
    `/api/library/ratings?user_id=${encodeURIComponent(userId)}`
  );
}

export async function saveUserRating(
  contentId: number,
  rating: number,
  userId = DEFAULT_USER
): Promise<UserRatingEntry> {
  return apiRequest<UserRatingEntry>(
    `/api/library/ratings?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ content_id: contentId, rating }),
    }
  );
}

export async function deleteUserRating(contentId: number, userId = DEFAULT_USER): Promise<void> {
  await apiRequest<{ deleted: boolean }>(
    `/api/library/ratings/${contentId}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}

export async function fetchUserPreferences(userId = DEFAULT_USER): Promise<UserPreferences> {
  return apiRequest<UserPreferences>(
    `/api/library/preferences?user_id=${encodeURIComponent(userId)}`
  );
}

export async function updateUserPreferences(
  payload: Partial<
    Pick<
      UserPreferences,
      | 'preferred_genres'
      | 'disliked_genres'
      | 'preferred_types'
      | 'preferred_languages'
      | 'min_rating'
      | 'favorite_themes'
      | 'preferred_era'
      | 'onboarding_completed'
      | 'discovery_openness'
    >
  >,
  userId = DEFAULT_USER
): Promise<UserPreferences> {
  return apiRequest<UserPreferences>(
    `/api/library/preferences?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
}
