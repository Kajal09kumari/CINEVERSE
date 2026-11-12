/**
 * CINEVERSE Hybrid ML Recommendations & MIRA AI Client Service
 */

import { apiRequest } from './api';
import type {
  FeedbackRecord,
  FeedbackType,
  HybridRecommendationResponse,
  MiraChatResponse,
  MiraSessionHistoryResponse,
} from '@/types';

const DEFAULT_USER = 'local-default';

export async function getPersonalizedRecommendations(params?: {
  userId?: string;
  region?: string;
  topK?: number;
  contentType?: string;
}): Promise<HybridRecommendationResponse> {
  const qs = new URLSearchParams({
    user_id: params?.userId ?? DEFAULT_USER,
    top_k: String(params?.topK ?? 8),
  });
  if (params?.region) qs.set('region', params.region);
  if (params?.contentType) qs.set('content_type', params.contentType);
  return apiRequest<HybridRecommendationResponse>(`/api/recommendations/personalized?${qs.toString()}`);
}

export async function getSimilarRecommendations(
  contentId: number,
  params?: { userId?: string; region?: string; topK?: number }
): Promise<HybridRecommendationResponse> {
  const qs = new URLSearchParams({
    user_id: params?.userId ?? DEFAULT_USER,
    top_k: String(params?.topK ?? 6),
  });
  if (params?.region) qs.set('region', params.region);
  return apiRequest<HybridRecommendationResponse>(
    `/api/recommendations/similar/${contentId}?${qs.toString()}`
  );
}

export async function getModelMetrics(): Promise<{
  model: string;
  dataset: Record<string, number | string>;
  evaluation: Record<string, number>;
}> {
  return apiRequest('/api/recommendations/metrics');
}

export async function submitRecommendationFeedback(payload: {
  feedback_type: FeedbackType;
  content_id?: number | null;
  movielens_movie_id?: number | null;
  title?: string;
  reason?: string;
  session_id?: string;
  user_id?: string;
}): Promise<{ recorded: FeedbackRecord; profile_note: string }> {
  return apiRequest('/api/recommendations/feedback', {
    method: 'POST',
    body: JSON.stringify({
      user_id: DEFAULT_USER,
      ...payload,
    }),
  });
}

export async function listRecommendationFeedback(userId = DEFAULT_USER): Promise<FeedbackRecord[]> {
  return apiRequest<FeedbackRecord[]>(
    `/api/recommendations/feedback?user_id=${encodeURIComponent(userId)}&limit=50`
  );
}

export async function sendMiraMessage(payload: {
  message: string;
  session_id: string;
  user_id?: string;
  region?: string;
  top_k?: number;
}): Promise<MiraChatResponse> {
  return apiRequest<MiraChatResponse>('/api/mira/chat', {
    method: 'POST',
    body: JSON.stringify({
      user_id: DEFAULT_USER,
      top_k: 6,
      ...payload,
    }),
  });
}

export async function fetchMiraHistory(
  sessionId: string,
  userId = DEFAULT_USER
): Promise<MiraSessionHistoryResponse> {
  return apiRequest<MiraSessionHistoryResponse>(
    `/api/mira/history?session_id=${encodeURIComponent(sessionId)}&user_id=${encodeURIComponent(userId)}`
  );
}

export async function clearMiraHistory(
  sessionId: string,
  userId = DEFAULT_USER
): Promise<{ cleared: boolean }> {
  return apiRequest<{ cleared: boolean }>(
    `/api/mira/history?session_id=${encodeURIComponent(sessionId)}&user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}

// ─── Day 5: Taste DNA, Onboarding, Interactions & Adaptive Homepage ────────

export async function fetchTasteDna(
  userId = DEFAULT_USER
): Promise<import('@/types').TasteDnaProfile> {
  return apiRequest(
    `/api/recommendations/taste-dna?user_id=${encodeURIComponent(userId)}`
  );
}

export async function submitOnboarding(payload: {
  user_id?: string;
  preferred_genres: string[];
  disliked_genres?: string[];
  preferred_types?: string[];
  preferred_languages?: string[];
  favorite_themes?: string[];
  preferred_era?: string;
  min_rating?: number;
  discovery_openness?: number;
}): Promise<import('@/types').TasteDnaProfile> {
  return apiRequest('/api/recommendations/onboarding', {
    method: 'POST',
    body: JSON.stringify({
      user_id: DEFAULT_USER,
      ...payload,
    }),
  });
}

export async function recordInteraction(payload: {
  user_id?: string;
  content_id?: number | null;
  movielens_movie_id?: number | null;
  title?: string;
  content_type?: string;
  genres?: string[];
  interaction_type?: import('@/types').InteractionType;
  progress_pct?: number;
}): Promise<import('@/types').InteractionRecord> {
  return apiRequest('/api/recommendations/interaction', {
    method: 'POST',
    body: JSON.stringify({
      user_id: DEFAULT_USER,
      ...payload,
    }),
  });
}

export async function fetchInteractions(
  userId = DEFAULT_USER,
  limit = 40
): Promise<import('@/types').InteractionRecord[]> {
  return apiRequest(
    `/api/recommendations/interactions?user_id=${encodeURIComponent(userId)}&limit=${limit}`
  );
}

export async function fetchAdaptiveHomeSections(params?: {
  userId?: string;
  region?: string;
  perSectionK?: number;
}): Promise<import('@/types').AdaptiveHomepageResponse> {
  const qs = new URLSearchParams({
    user_id: params?.userId ?? DEFAULT_USER,
    per_section_k: String(params?.perSectionK ?? 8),
  });
  if (params?.region) qs.set('region', params.region);
  return apiRequest(`/api/recommendations/home-sections?${qs.toString()}`);
}

export async function resetPersonalization(
  userId = DEFAULT_USER
): Promise<{ user_id: string; reset: boolean; cleared: Record<string, number> }> {
  return apiRequest(
    `/api/recommendations/reset?user_id=${encodeURIComponent(userId)}`,
    { method: 'POST' }
  );
}
