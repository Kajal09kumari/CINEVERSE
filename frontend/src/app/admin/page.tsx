'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bookmark,
  Film,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Users,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';
import {
  fetchAdminAnalytics,
  type AdminAnalyticsResponse,
} from '@/services/analyticsService';

type RangeKey = '24h' | '7d' | '30d' | 'all';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: 'Last 24h' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

const SESSION_ADMIN_KEY = 'cineverse_admin_key_session';

function MetricCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="p-5 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-2">
      <div className="flex items-center justify-between text-[#9e9ba5]">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        <span className="text-[#A68BC7]">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-[#F5F2F7] tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[#77727F]">{sub}</p>}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [adminKey, setAdminKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState<string>('');
  const [range, setRange] = useState<RangeKey>('7d');
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (key: string, r: RangeKey) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminAnalytics(key, r);
      setData(res);
      setAdminKey(key);
      setKeyInput(key);
      try {
        window.sessionStorage.setItem(SESSION_ADMIN_KEY, key);
      } catch {
        // ignore storage restrictions
      }
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    try {
      const saved = window.sessionStorage.getItem(SESSION_ADMIN_KEY);
      if (saved) {
        fetchAdminAnalytics(saved, '7d')
          .then((res) => {
            if (!active) return;
            setData(res);
            setAdminKey(saved);
            setKeyInput(saved);
            setError(null);
          })
          .catch(() => {
            // Keep unlock form if saved key is no longer valid
          });
      }
    } catch {
      // ignore
    }
    return () => {
      active = false;
    };
  }, []);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    void loadAnalytics(trimmed, range);
  }

  function handleLock() {
    setAdminKey('');
    setKeyInput('');
    setData(null);
    setError(null);
    try {
      window.sessionStorage.removeItem(SESSION_ADMIN_KEY);
    } catch {
      // ignore
    }
  }

  function handleRangeChange(next: RangeKey) {
    setRange(next);
    if (adminKey) {
      void loadAnalytics(adminKey, next);
    }
  }

  const maxDailyTotal = data?.daily_activity?.length
    ? Math.max(
        1,
        ...data.daily_activity.map(
          (d) => d.views + d.searches + d.recommendations + d.mira
        )
      )
    : 1;

  const eventEntries = data
    ? Object.entries(data.event_breakdown).sort((a, b) => b[1] - a[1])
    : [];
  const maxEventCount = eventEntries.length
    ? Math.max(1, ...eventEntries.map(([, c]) => c))
    : 1;

  return (
    <div className="min-h-screen flex flex-col bg-[#101014]">
      <Navbar />
      <main id="main-content" className="flex-1 pt-28 pb-16">
        <Container className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#A68BC7]">
                <ShieldCheck size={14} />
                Protected Telemetry
              </div>
              <h1
                className="text-3xl sm:text-4xl font-semibold text-[#F5F2F7]"
                style={{ fontFamily: 'var(--font-playfair)' }}
              >
                CINEVERSE Analytics Dashboard
              </h1>
              <p className="text-sm text-[#9e9ba5]">
                Real-time SQLite product telemetry, recommendation CTR, and MIRA usage.
              </p>
            </div>

            {data && (
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex rounded-xl bg-[#17161D] border border-white/[0.08] p-1"
                  role="group"
                  aria-label="Date range filter"
                >
                  {RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleRangeChange(opt.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        range === opt.key
                          ? 'bg-[#8060A8] text-white'
                          : 'text-[#9e9ba5] hover:text-[#F5F2F7]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void loadAnalytics(adminKey, range)}
                  disabled={loading}
                  aria-label="Refresh analytics"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#17161D] border border-white/[0.08] text-xs text-[#F5F2F7] hover:border-[#A68BC7] cursor-pointer"
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleLock}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#17161D] border border-white/[0.08] text-xs text-[#D9A45D] hover:border-[#D9A45D] cursor-pointer"
                >
                  <Lock size={13} />
                  Lock
                </button>
              </div>
            )}
          </div>

          {!data ? (
            <div className="max-w-md mx-auto mt-8 p-7 rounded-2xl bg-[#17161D] border border-white/[0.09] space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#8060A8]/20 text-[#A68BC7] flex items-center justify-center">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#F5F2F7]">
                    Admin Key Required
                  </h2>
                  <p className="text-xs text-[#9e9ba5]">
                    Enter the server <code className="text-[#D9A45D]">ADMIN_API_KEY</code>{' '}
                    to unlock analytics.
                  </p>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleUnlock} className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#AAA5B3]">
                    X-Admin-Key
                  </span>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Enter admin API key..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#101014] border border-white/[0.1] text-sm text-[#F5F2F7] focus:outline-none focus:border-[#8060A8]"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-[#8060A8] hover:bg-[#9372bc] text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-60"
                >
                  {loading ? 'Verifying…' : 'Unlock Analytics Dashboard'}
                </button>
              </form>
            </div>
          ) : (
            <>
              {/* Platform Overview */}
              <section aria-labelledby="overview-heading" className="space-y-4">
                <h2 id="overview-heading" className="text-sm font-semibold uppercase tracking-wider text-[#9e9ba5]">
                  Platform Overview
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    label="Total Events"
                    value={data.platform_overview.total_events}
                    sub={`${data.platform_overview.unique_sessions} active sessions`}
                    icon={<Activity size={16} />}
                  />
                  <MetricCard
                    label="Unique Users"
                    value={data.platform_overview.unique_users}
                    sub={`${data.platform_overview.total_collections} collections created`}
                    icon={<Users size={16} />}
                  />
                  <MetricCard
                    label="Content Views"
                    value={data.platform_overview.total_content_views}
                    sub={`${data.platform_overview.total_searches} searches performed`}
                    icon={<Film size={16} />}
                  />
                  <MetricCard
                    label="Watchlist Items"
                    value={data.platform_overview.active_watchlist_items}
                    sub={`${data.platform_overview.api_credits_used} Watchmode API credits`}
                    icon={<Bookmark size={16} />}
                  />
                </div>
              </section>

              {/* Recommendation & MIRA Analytics */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-[#F5F2F7] flex items-center gap-2">
                      <ThumbsUp size={16} className="text-[#D9A45D]" />
                      Recommendation Analytics
                    </h2>
                    <span className="text-xs text-[#77727F]">Live CTR & Feedback</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-[#101014] border border-white/[0.06]">
                      <p className="text-[11px] text-[#9e9ba5]">Displayed</p>
                      <p className="text-xl font-bold text-[#F5F2F7]">
                        {data.recommendation_analytics.recommendations_displayed}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#101014] border border-white/[0.06]">
                      <p className="text-[11px] text-[#9e9ba5]">Clicked</p>
                      <p className="text-xl font-bold text-[#F5F2F7]">
                        {data.recommendation_analytics.recommendations_clicked}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#101014] border border-white/[0.06]">
                      <p className="text-[11px] text-[#9e9ba5]">CTR</p>
                      <p className="text-xl font-bold text-[#D9A45D]">
                        {data.recommendation_analytics.ctr_pct !== null
                          ? `${data.recommendation_analytics.ctr_pct}%`
                          : 'Unavailable'}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#101014] border border-white/[0.06]">
                      <p className="text-[11px] text-[#9e9ba5]">Likes</p>
                      <p className="text-xl font-bold text-emerald-400">
                        {data.recommendation_analytics.likes}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#101014] border border-white/[0.06]">
                      <p className="text-[11px] text-[#9e9ba5]">Dislikes</p>
                      <p className="text-xl font-bold text-rose-400">
                        {data.recommendation_analytics.dislikes}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#101014] border border-white/[0.06]">
                      <p className="text-[11px] text-[#9e9ba5]">Like Ratio</p>
                      <p className="text-xl font-bold text-[#A68BC7]">
                        {data.recommendation_analytics.like_ratio_pct !== null
                          ? `${data.recommendation_analytics.like_ratio_pct}%`
                          : 'Unavailable'}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-[#F5F2F7] flex items-center gap-2">
                      <Sparkles size={16} className="text-[#A68BC7]" />
                      MIRA Assistant Analytics
                    </h2>
                    <span className="text-xs text-[#77727F]">Privacy-safe intents</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-[#101014] border border-white/[0.06]">
                      <p className="text-[11px] text-[#9e9ba5]">Conversations</p>
                      <p className="text-xl font-bold text-[#F5F2F7]">
                        {data.mira_analytics.conversations_started}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#101014] border border-white/[0.06]">
                      <p className="text-[11px] text-[#9e9ba5]">Messages</p>
                      <p className="text-xl font-bold text-[#F5F2F7]">
                        {data.mira_analytics.total_messages}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#101014] border border-white/[0.06]">
                      <p className="text-[11px] text-[#9e9ba5]">Rec Clicks</p>
                      <p className="text-xl font-bold text-[#D9A45D]">
                        {data.mira_analytics.recommendation_clicks_from_mira}
                      </p>
                    </div>
                  </div>
                  {data.mira_analytics.top_intents.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {data.mira_analytics.top_intents.map((item) => (
                        <span
                          key={item.intent}
                          className="px-2.5 py-1 rounded-full bg-[#101014] border border-white/[0.08] text-xs text-[#CCC7D4]"
                        >
                          {item.intent} · <strong className="text-[#F5F2F7]">{item.count}</strong>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#77727F]">No MIRA intent events in selected range.</p>
                  )}
                </section>
              </div>

              {/* Charts: Daily Activity + Event Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-4">
                  <h2 className="text-base font-semibold text-[#F5F2F7] flex items-center gap-2">
                    <BarChart3 size={16} className="text-[#A68BC7]" />
                    Daily Activity Trend
                  </h2>
                  {data.daily_activity.length === 0 ? (
                    <p className="text-xs text-[#77727F] py-8 text-center">
                      No events recorded in this date window yet.
                    </p>
                  ) : (
                    <div className="flex items-end gap-2 h-40 pt-4">
                      {data.daily_activity.map((day) => {
                        const total =
                          day.views + day.searches + day.recommendations + day.mira;
                        const pct = Math.max(8, Math.round((total / maxDailyTotal) * 100));
                        return (
                          <div
                            key={day.date}
                            className="flex-1 flex flex-col items-center gap-1.5 min-w-[24px]"
                          >
                            <span className="text-[10px] text-[#9e9ba5] tabular-nums">
                              {total}
                            </span>
                            <div className="w-full h-24 flex items-end">
                              <div
                                className="w-full rounded-t-md bg-gradient-to-t from-[#8060A8] to-[#D9A45D]"
                                style={{ height: `${pct}%` }}
                                title={`${day.date}: ${total} events`}
                              />
                            </div>
                            <span className="text-[10px] text-[#77727F] truncate max-w-full">
                              {day.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-4">
                  <h2 className="text-base font-semibold text-[#F5F2F7]">
                    Event Breakdown
                  </h2>
                  {eventEntries.length === 0 ? (
                    <p className="text-xs text-[#77727F] py-8 text-center">
                      No product events recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {eventEntries.slice(0, 8).map(([evType, cnt]) => {
                        const widthPct = Math.max(4, Math.round((cnt / maxEventCount) * 100));
                        return (
                          <div key={evType} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-[#D8D3DE] font-mono">{evType}</span>
                              <span className="text-[#9e9ba5] tabular-nums">{cnt}</span>
                            </div>
                            <div className="h-2 rounded-full bg-[#101014] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#8060A8]"
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              {/* Content Analytics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-3">
                  <h3 className="text-sm font-semibold text-[#F5F2F7] flex items-center gap-2">
                    <Film size={15} className="text-[#D9A45D]" />
                    Top Viewed Titles
                  </h3>
                  {data.content_analytics.top_viewed_content.length === 0 ? (
                    <p className="text-xs text-[#77727F]">No title views recorded yet.</p>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {data.content_analytics.top_viewed_content.map((item, idx) => (
                        <li key={`${item.title}-${idx}`} className="flex justify-between gap-2">
                          <span className="text-[#D8D3DE] truncate">{item.title}</span>
                          <span className="text-[#D9A45D] font-semibold tabular-nums">
                            {item.views}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-3">
                  <h3 className="text-sm font-semibold text-[#F5F2F7] flex items-center gap-2">
                    <Search size={15} className="text-[#A68BC7]" />
                    Top Search Queries
                  </h3>
                  {data.content_analytics.top_searched_queries.length === 0 ? (
                    <p className="text-xs text-[#77727F]">No searches recorded yet.</p>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {data.content_analytics.top_searched_queries.map((q) => (
                        <li key={q.query} className="flex justify-between gap-2">
                          <span className="text-[#D8D3DE] truncate">{q.query}</span>
                          <span className="text-[#A68BC7] font-semibold tabular-nums">
                            {q.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-3">
                  <h3 className="text-sm font-semibold text-[#F5F2F7]">
                    Popular Genres & Filters
                  </h3>
                  <p className="text-xs text-[#9e9ba5]">
                    Streaming checks:{' '}
                    <strong className="text-[#F5F2F7]">
                      {data.content_analytics.streaming_checks}
                    </strong>
                  </p>
                  {data.content_analytics.top_genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {data.content_analytics.top_genres.map((g) => (
                        <span
                          key={g.genre}
                          className="px-2 py-0.5 rounded-full bg-[#101014] border border-white/[0.08] text-[11px] text-[#CCC7D4]"
                        >
                          {g.genre} ({g.count})
                        </span>
                      ))}
                    </div>
                  )}
                  {data.content_analytics.discover_filter_usage.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {data.content_analytics.discover_filter_usage.map((f) => (
                        <span
                          key={f.filter}
                          className="px-2 py-0.5 rounded-md bg-[#8060A8]/15 border border-[#8060A8]/30 text-[11px] text-[#A68BC7]"
                        >
                          {f.filter} · {f.count}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </Container>
      </main>
      <Footer />
    </div>
  );
}
