/**
 * CINEVERSE API Service
 *
 * Central configuration for all backend communication.
 * Never hardcode the API URL in individual components —
 * always import from this module.
 *
 * The base URL is controlled by the NEXT_PUBLIC_API_BASE_URL
 * environment variable, so it can be changed per environment
 * (dev, staging, production) without code changes.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

/**
 * A thin wrapper around fetch that:
 * 1. Prepends the base URL automatically
 * 2. Sets JSON content-type headers
 * 3. Throws a typed error on non-2xx responses
 */
export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(
      `API error: ${response.status} ${response.statusText} — ${url}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Check whether the backend API is reachable and healthy.
 * Returns the health response or throws if the backend is down.
 */
export async function checkBackendHealth(): Promise<{
  status: string;
  project: string;
}> {
  return apiRequest<{ status: string; project: string }>('/health');
}
