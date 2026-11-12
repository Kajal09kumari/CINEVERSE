/**
 * CINEVERSE Utility Functions
 *
 * Small, pure helper functions used across the application.
 * Keep this file focused — large domain utilities should live
 * in their own files.
 */

/**
 * Normalizes a poster/backdrop image URL returned by Watchmode.
 * Never constructs image.tmdb.org URLs from relative paths; returns null
 * if no full URL is available so components render PosterFallback cleanly.
 */
export function contentImageUrl(
  urlOrPath: string | null | undefined,
): string | null {
  if (!urlOrPath) return null;
  const trimmed = urlOrPath.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return null;
}

/**
 * Formats a release date string (YYYY-MM-DD) safely to a 4-digit year string.
 */
export function releaseYear(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const match = /^\d{4}/.exec(dateString.trim());
  return match ? match[0] : '';
}

/**
 * Rounds a vote average to one decimal place.
 */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/**
 * Clamps a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Truncates a string to a max length, adding ellipsis if needed.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
