'use client';

/**
 * useWatchlist Hook
 *
 * Syncs Watchlist across fast client state (localStorage + useSyncExternalStore)
 * and SQLite backend persistence (`/api/library/watchlist`) with deduplication.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Movie, PersistedWatchlistItem } from '@/types';
import {
  clearRemoteWatchlist,
  deleteWatchlistItem,
  fetchWatchlist,
  saveWatchlistItem,
  syncWatchlistBulk,
} from '@/services/libraryService';
import { getActiveUserId, subscribeActiveUserId } from '@/lib/userContext';
import { trackEvent } from '@/services/analyticsService';

const STORAGE_PREFIX = 'cineverse_watchlist_prototype';
const EMPTY_WATCHLIST: Movie[] = [];

const listeners = new Set<() => void>();
let cachedKey: string | null = null;
let cachedRaw: string | null = null;
let cachedSnapshot: Movie[] = EMPTY_WATCHLIST;
const hydratedUsers = new Set<string>();

function storageKeyForUser(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function persistedToMovie(item: PersistedWatchlistItem): Movie {
  return {
    id: item.content_id,
    title: item.title,
    overview: '',
    poster_path: item.poster_url,
    backdrop_path: null,
    release_date: item.release_year ? `${item.release_year}-01-01` : '',
    vote_average: item.rating ?? 0,
    vote_count: 0,
    genre_ids: [],
    genres: item.genres ?? [],
    original_language: '',
    content_type: item.content_type,
    is_documentary: item.is_documentary,
  };
}

function getSnapshot(): Movie[] {
  if (typeof window === 'undefined') return EMPTY_WATCHLIST;
  try {
    const userId = getActiveUserId();
    const key = storageKeyForUser(userId);
    const raw = window.localStorage.getItem(key);
    if (key === cachedKey && raw === cachedRaw) return cachedSnapshot;
    cachedKey = key;
    cachedRaw = raw;
    if (!raw) {
      cachedSnapshot = EMPTY_WATCHLIST;
      return cachedSnapshot;
    }
    const parsed = JSON.parse(raw);
    const arr: Movie[] = Array.isArray(parsed) ? parsed : EMPTY_WATCHLIST;
    const seen = new Set<number>();
    cachedSnapshot = arr.filter((m) => {
      if (!m || typeof m.id !== 'number' || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    return cachedSnapshot;
  } catch {
    return EMPTY_WATCHLIST;
  }
}

function getServerSnapshot(): Movie[] {
  return EMPTY_WATCHLIST;
}

function emitChange() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(listener);
    };
  }
  const handleStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(STORAGE_PREFIX)) emitChange();
  };
  const unsubUser = subscribeActiveUserId(() => {
    cachedKey = null;
    emitChange();
  });
  window.addEventListener('storage', handleStorage);
  return () => {
    listeners.delete(listener);
    unsubUser();
    window.removeEventListener('storage', handleStorage);
  };
}

function writeList(next: Movie[], userId: string) {
  if (typeof window === 'undefined') return;
  try {
    const seen = new Set<number>();
    const deduped = next.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    const serialized = JSON.stringify(deduped);
    const key = storageKeyForUser(userId);
    cachedKey = key;
    cachedRaw = serialized;
    cachedSnapshot = deduped;
    window.localStorage.setItem(key, serialized);
    emitChange();
  } catch {
    // Ignore quota errors
  }
}

async function ensureRemoteSynced(userId: string): Promise<void> {
  if (hydratedUsers.has(userId) || typeof window === 'undefined') return;
  hydratedUsers.add(userId);
  try {
    const localItems = getSnapshot();
    const remoteItems = await fetchWatchlist(userId);
    if (remoteItems.length === 0 && localItems.length > 0) {
      const synced = await syncWatchlistBulk(localItems, userId);
      writeList(synced.map(persistedToMovie), userId);
    } else if (remoteItems.length > 0) {
      const remoteIds = new Set(remoteItems.map((r) => r.content_id));
      const localOnly = localItems.filter((m) => !remoteIds.has(m.id));
      if (localOnly.length > 0) {
        const merged = await syncWatchlistBulk(localOnly, userId);
        writeList(merged.map(persistedToMovie), userId);
      } else {
        writeList(remoteItems.map(persistedToMovie), userId);
      }
    }
  } catch {
    // Keep local snapshot if backend is unreachable
  }
}

export function useWatchlist() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    const syncActive = () => {
      const uid = getActiveUserId();
      void ensureRemoteSynced(uid).finally(() => {
        if (active) setHydrated(true);
      });
    };
    syncActive();
    const unsub = subscribeActiveUserId(syncActive);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const isInWatchlist = useCallback(
    (movieId: number) => items.some((m) => m.id === movieId),
    [items]
  );

  const toggleWatchlist = useCallback((movie: Movie) => {
    const uid = getActiveUserId();
    const current = getSnapshot();
    const exists = current.some((m) => m.id === movie.id);
    const updated = exists
      ? current.filter((m) => m.id !== movie.id)
      : [movie, ...current];
    writeList(updated, uid);

    if (exists) {
      void deleteWatchlistItem(movie.id, uid).catch(() => {});
      trackEvent({
        event_type: 'watchlist_removed',
        user_id: uid,
        content_id: movie.id,
        title: movie.title,
        source_surface: 'watchlist',
      });
    } else {
      void saveWatchlistItem(movie, uid).catch(() => {});
      trackEvent({
        event_type: 'watchlist_added',
        user_id: uid,
        content_id: movie.id,
        title: movie.title,
        source_surface: 'watchlist',
      });
    }
  }, []);

  const clearWatchlist = useCallback(() => {
    const uid = getActiveUserId();
    writeList([], uid);
    void clearRemoteWatchlist(uid).catch(() => {});
  }, []);

  return {
    items,
    hydrated,
    isInWatchlist,
    toggleWatchlist,
    clearWatchlist,
  };
}
