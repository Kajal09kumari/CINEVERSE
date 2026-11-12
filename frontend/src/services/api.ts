/**
 * CINEVERSE API Service
 *
 * Central configuration for all backend communication.
 * Preserves structured HTTP error details cleanly without leaking internals.
 */

import type { ApiHealthResponse } from '@/types';

const RAW_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000';

export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, '');

function formatApiErrorMessage(status: number, rawDetail: string): string {
  const detail = rawDetail.trim();

  if (status === 0) {
    return 'Unable to reach the CINEVERSE backend API. Ensure the FastAPI server is running.';
  }
  if (status === 400 || status === 422) {
    return detail || 'Invalid request parameters provided.';
  }
  if (status === 401 || status === 403 || detail.toLowerCase().includes('authentication failed')) {
    return detail || 'Watchmode authentication failed. Verify WATCHMODE_API_KEY in backend/.env.';
  }
  if (status === 404) {
    return detail || 'Requested content could not be found.';
  }
  if (status === 429) {
    return detail || 'Watchmode API quota or rate limit reached. Cached catalog titles remain available.';
  }
  if (status === 503) {
    return detail || 'Content discovery service is currently unconfigured or unavailable.';
  }
  if (status === 504) {
    return detail || 'Content discovery request timed out. Please try again.';
  }
  if (status >= 500) {
    return detail || `Upstream content service error (HTTP ${status}).`;
  }

  return detail || `Request failed (HTTP ${status}).`;
}

function extractFastApiDetail(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('detail' in body)) return null;
  const raw = (body as { detail?: unknown }).detail;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as { msg?: unknown; loc?: unknown };
    if (first && typeof first.msg === 'string') {
      return first.msg;
    }
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    const cleanMessage = formatApiErrorMessage(status, detail);
    super(cleanMessage);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Typed JSON wrapper around fetch for the CINEVERSE FastAPI backend.
 */
export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
  } catch {
    throw new ApiError(
      0,
      'Unable to reach the CINEVERSE backend API. Ensure the FastAPI server is running.'
    );
  }

  if (!response.ok) {
    let detail = `Request failed (HTTP ${response.status})`;
    try {
      const errBody: unknown = await response.json();
      const extracted = extractFastApiDetail(errBody);
      if (extracted) {
        detail = extracted;
      }
    } catch {
      // Ignore JSON parsing failure on non-JSON error bodies
    }
    throw new ApiError(response.status, detail);
  }

  return response.json() as Promise<T>;
}

/**
 * Check whether the backend API is reachable and healthy.
 */
export async function checkBackendHealth(): Promise<ApiHealthResponse> {
  return apiRequest<ApiHealthResponse>('/health');
}
