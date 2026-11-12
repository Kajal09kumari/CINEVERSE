'use client';

/**
 * Active user profile identifier for CINEVERSE personalization isolation.
 * Persisted in localStorage so switching profiles cleanly isolates Taste DNA,
 * watchlist, collections, ratings, and MIRA chat history.
 */

const STORAGE_KEY = 'cineverse_active_user_id';
export const DEFAULT_USER_ID = 'local-default';

const listeners = new Set<() => void>();

export function getActiveUserId(): string {
  if (typeof window === 'undefined') return DEFAULT_USER_ID;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && stored.trim().length > 0 ? stored.trim() : DEFAULT_USER_ID;
}

export function setActiveUserId(userId: string): void {
  if (typeof window === 'undefined') return;
  const clean = userId.trim() || DEFAULT_USER_ID;
  window.localStorage.setItem(STORAGE_KEY, clean);
  listeners.forEach((cb) => cb());
}

export function subscribeActiveUserId(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(callback);
    };
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}
