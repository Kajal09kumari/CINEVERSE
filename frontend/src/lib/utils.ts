/**
 * CINEVERSE Utility Functions
 *
 * Small, pure helper functions used across the application.
 * Keep this file focused — large domain utilities should live
 * in their own files.
 */

/**
 * Builds a full TMDB image URL from a path.
 * @param path - The path returned by TMDB API (e.g. "/abc123.jpg")
 * @param size - Tailwind image width size descriptor
 */
export function tmdbImageUrl(
  path: string | null | undefined,
  size: 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'
): string {
  if (!path) return '/placeholder-poster.svg';
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/**
 * Formats a release date string to a readable year.
 */
export function releaseYear(dateString: string): string {
  if (!dateString) return 'Unknown';
  return new Date(dateString).getFullYear().toString();
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
