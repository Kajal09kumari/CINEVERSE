import { API_BASE_URL } from '@/services/api';

export type AnalyticsEventType =
  | 'content_viewed'
  | 'content_searched'
  | 'search_result_clicked'
  | 'watchlist_added'
  | 'watchlist_removed'
  | 'collection_created'
  | 'recommendation_displayed'
  | 'recommendation_clicked'
  | 'recommendation_feedback'
  | 'mira_conversation_started'
  | 'discover_filters_used'
  | 'streaming_availability_checked';

export interface TrackEventInput {
  event_type: AnalyticsEventType;
  user_id?: string | null;
  session_id?: string | null;
  content_id?: number | null;
  title?: string | null;
  source_surface?: string;
  dedupe_key?: string;
  metadata?: Record<string, unknown>;
}

export interface AdminAnalyticsResponse {
  range: string;
  days: number | null;
  generated_at: string;
  platform_overview: {
    total_events: number;
    unique_users: number;
    unique_sessions: number;
    active_watchlist_items: number;
    total_collections: number;
    total_searches: number;
    total_content_views: number;
    mira_conversations_started: number;
    api_credits_used: number;
  };
  content_analytics: {
    top_viewed_content: Array<{ content_id: number | null; title: string; views: number }>;
    top_searched_queries: Array<{ query: string; count: number }>;
    top_genres: Array<{ genre: string; count: number }>;
    discover_filter_usage: Array<{ filter: string; count: number }>;
    streaming_checks: number;
  };
  recommendation_analytics: {
    recommendations_displayed: number;
    recommendations_clicked: number;
    ctr_pct: number | null;
    likes: number;
    dislikes: number;
    like_ratio_pct: number | null;
  };
  mira_analytics: {
    conversations_started: number;
    total_messages: number;
    recommendation_clicks_from_mira: number;
    top_intents: Array<{ intent: string; count: number }>;
  };
  event_breakdown: Record<string, number>;
  daily_activity: Array<{
    date: string;
    views: number;
    searches: number;
    recommendations: number;
    mira: number;
  }>;
}

const recentDedupeMap = new Map<string, number>();

export function getOrCreateAnalyticsSessionId(): string {
  if (typeof window === 'undefined') return 'ssr-session';
  const key = 'cineverse_analytics_session_id';
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return 'anon-session';
  }
}

function getActiveUserId(): string {
  if (typeof window === 'undefined') return 'local-default';
  try {
    return window.localStorage.getItem('cineverse_user_id') || 'local-default';
  } catch {
    return 'local-default';
  }
}

export function trackEvent(input: TrackEventInput): void {
  if (typeof window === 'undefined') return;

  const dedupeKey =
    input.dedupe_key ||
    `${input.event_type}:${input.content_id ?? ''}:${input.source_surface ?? ''}:${input.title ?? ''}`;
  const now = Date.now();
  const lastTs = recentDedupeMap.get(dedupeKey);
  if (lastTs && now - lastTs < 2000) {
    return;
  }
  recentDedupeMap.set(dedupeKey, now);

  const payload = {
    event_type: input.event_type,
    user_id: input.user_id ?? getActiveUserId(),
    session_id: input.session_id ?? getOrCreateAnalyticsSessionId(),
    content_id: input.content_id ?? null,
    title: input.title ?? null,
    source_surface: input.source_surface ?? '',
    dedupe_key: dedupeKey,
    metadata: input.metadata ?? {},
  };

  const url = `${API_BASE_URL}/api/analytics/event`;
  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never throw into UI
  }
}

export async function fetchAdminAnalytics(
  adminKey: string,
  range: '24h' | '7d' | '30d' | 'all' = '7d'
): Promise<AdminAnalyticsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/admin/analytics?range=${range}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': adminKey,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const msg =
      typeof body?.detail === 'string'
        ? body.detail
        : `Admin analytics request failed (${response.status})`;
    throw new Error(msg);
  }

  return response.json() as Promise<AdminAnalyticsResponse>;
}
