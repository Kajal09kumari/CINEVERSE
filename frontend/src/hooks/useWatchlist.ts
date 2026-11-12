'use client';

/**
 * useWatchlist — local browser prototype hook for saving movies.
 *
 * Uses React's useSyncExternalStore backed by localStorage so state
 * stays synchronized across components and avoids SSR hydration mismatches
 * without calling setState inside useEffect.
 */

import { useSyncExternalStore, useCallback } from 'react';
import type { Movie } from '@/types';

const STORAGE_KEY = 'cineverse_watchlist_prototype';
const WATCHLIST_EVENT = 'cineverse-watchlist-change';
const EMPTY_LIST: Movie[] = [];

let cachedRaw: string | null = null;
let cachedParsed: Movie[] = EMPTY_LIST;

function getSnapshot(): Movie[] {
  if (typeof window === 'undefined') return EMPTY_LIST;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedParsed;
    cachedRaw = raw;
    if (!raw) {
      cachedParsed = EMPTY_LIST;
      return cachedParsed;
    }
    const parsed = JSON.parse(raw);
    cachedParsed = Array.isArray(parsed) ? (parsed as Movie[]) : EMPTY_LIST;
    return cachedParsed;
  } catch {
    return EMPTY_LIST;
  }
}

function getServerSnapshot(): Movie[] {
  return EMPTY_LIST;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener('storage', handler);
  window.addEventListener(WATCHLIST_EVENT, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(WATCHLIST_EVENT, handler);
  };
}

function writeStore(next: Movie[]) {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(next);
    cachedRaw = serialized;
    cachedParsed = next;
    window.localStorage.setItem(STORAGE_KEY, serialized);
    window.dispatchEvent(new Event(WATCHLIST_EVENT));
  } catch {
    // Ignore storage quota errors
  }
}

export function useWatchlist() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const isInWatchlist = useCallback(
    (movieId: number) => items.some((m) => m.id === movieId),
    [items]
  );

  const toggleWatchlist = useCallback((movie: Movie) => {
    const current = getSnapshot();
    const exists = current.some((m) => m.id === movie.id);
    const next = exists
      ? current.filter((m) => m.id !== movie.id)
      : [movie, ...current];
    writeStore(next);
  }, []);

  const clearWatchlist = useCallback(() => {
    writeStore([]);
  }, []);

  return {
    items,
    hydrated,
    isInWatchlist,
    toggleWatchlist,
    clearWatchlist,
  };
}
