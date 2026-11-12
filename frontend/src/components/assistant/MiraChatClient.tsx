'use client';

/**
 * MiraChatClient — Advanced Conversational Movie Intelligence & Recommendation Assistant
 *
 * Supports:
 * - Multi-turn natural-language discovery & constraint refinement
 * - Persistent SQLite conversational memory (`/api/mira/history`)
 * - Explainable recommendation cards (posters, ratings, genres, streaming platforms, rationale)
 * - Watchlist toggle + 5 explicit feedback actions (like, dislike, not_interested, already_watched, more_like_this)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Bookmark,
  Check,
  Compass,
  Eye,
  Heart,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  XCircle,
  MinusCircle,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { PosterFallback } from '@/components/movies/PosterFallback';
import { useWatchlist } from '@/hooks/useWatchlist';
import {
  clearMiraHistory,
  fetchMiraHistory,
  sendMiraMessage,
  submitRecommendationFeedback,
} from '@/services/miraService';
import { getActiveUserId } from '@/lib/userContext';
import { contentImageUrl } from '@/lib/utils';
import type {
  FeedbackType,
  MiraMessage,
  Movie,
  RecommendedTitleCard,
} from '@/types';

const SESSION_KEY = 'cineverse_mira_session_id';

const STARTER_PROMPTS = [
  'What should I watch tonight?',
  'Suggest something like Interstellar',
  'I want an underrated psychological thriller',
  'Something short, emotional and highly rated',
  'Documentaries about space',
  'TV series with mystery',
  'Give me something different from my usual preferences',
  'Recommend based on my watchlist',
];

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'default-mira-session';
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const generated = `mira-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  window.localStorage.setItem(SESSION_KEY, generated);
  return generated;
}

function recToMovieSummary(rec: RecommendedTitleCard): Movie | null {
  if (!rec.content_id) return null;
  return {
    id: rec.content_id,
    title: rec.title,
    overview: rec.description ?? rec.explanation,
    poster_path: rec.poster_url,
    backdrop_path: null,
    release_date: rec.release_year ? `${rec.release_year}-01-01` : '',
    vote_average: rec.rating ?? 0,
    vote_count: 0,
    genre_ids: [],
    genres: rec.genres,
    original_language: '',
    content_type: rec.content_type,
    is_documentary: rec.is_documentary,
    runtime: rec.runtime,
  };
}

export function MiraChatClient() {
  const searchParams = useSearchParams();
  const initialQueryParam = (searchParams.get('q') ?? '').trim();

  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const [sessionId, setSessionId] = useState<string>('default-mira-session');
  const [region, setRegion] = useState<string>('IN');
  const [messages, setMessages] = useState<MiraMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [historyReady, setHistoryReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, { type: FeedbackType; note: string }>>({});

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sentInitialRef = useRef<boolean>(false);

  const handleSend = useCallback(
    async (rawText: string, overrideSessionId?: string) => {
      const text = rawText.trim();
      if (!text || sending) return;
      const activeSession = overrideSessionId ?? sessionId;

      setError(null);
      setInput('');
      setSending(true);

      const optimisticUser: MiraMessage = {
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
        recommendations: [],
        quick_refinements: [],
      };
      setMessages((prev) => [...prev, optimisticUser]);

      try {
        const res = await sendMiraMessage({
          message: text,
          session_id: activeSession,
          user_id: getActiveUserId(),
          region,
          top_k: 6,
        });
        const assistantMsg: MiraMessage = {
          role: 'assistant',
          content: res.reply,
          created_at: new Date().toISOString(),
          constraints: res.constraints,
          recommendations: res.recommendations,
          follow_up_question: res.follow_up_question,
          quick_refinements: res.quick_refinements,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to reach MIRA right now. Check that FastAPI is running.'
        );
      } finally {
        setSending(false);
      }
    },
    [region, sending, sessionId]
  );

  // Hydrate persistent SQLite session history and optional ?q= starter query
  useEffect(() => {
    let active = true;
    const sid = getOrCreateSessionId();

    async function init() {
      try {
        const hist = await fetchMiraHistory(sid, getActiveUserId());
        if (!active) return;
        setSessionId(sid);
        setMessages(hist.messages ?? []);
        setHistoryReady(true);

        if (initialQueryParam && !sentInitialRef.current) {
          sentInitialRef.current = true;
          await handleSend(initialQueryParam, sid);
        }
      } catch {
        if (!active) return;
        setSessionId(sid);
        setHistoryReady(true);
      }
    }

    void init();
    return () => {
      active = false;
    };
    // Run only once on mount for session + URL query hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending]);

  async function handleNewChat() {
    setError(null);
    setFeedbackMap({});
    try {
      await clearMiraHistory(sessionId, getActiveUserId());
    } catch {
      // Proceed cleanly
    }
    setMessages([]);
  }

  async function handleFeedback(rec: RecommendedTitleCard, type: FeedbackType) {
    const itemKey = `${rec.content_id ?? rec.movielens_id ?? rec.title}`;
    try {
      const res = await submitRecommendationFeedback({
        feedback_type: type,
        content_id: rec.content_id,
        movielens_movie_id: rec.movielens_id,
        title: rec.title,
        session_id: sessionId,
        user_id: getActiveUserId(),
      });
      setFeedbackMap((prev) => ({
        ...prev,
        [itemKey]: { type, note: res.profile_note },
      }));
      if (type === 'more_like_this') {
        await handleSend(`More like "${rec.title}"`);
      }
    } catch {
      setFeedbackMap((prev) => ({
        ...prev,
        [itemKey]: { type, note: 'Feedback noted.' },
      }));
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void handleSend(input);
  }

  return (
    <Container className="pt-26 pb-16 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#8060A8]/20 border border-[#8060A8]/40 flex items-center justify-center text-[#A68BC7]">
              <Sparkles size={14} />
            </span>
            <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-[#A68BC7]">
              Movie Intelligence & Recommendation Assistant
            </p>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#F5F2F7] tracking-tight">
            MIRA Concierge
          </h1>
          <p className="text-xs sm:text-sm text-[#AAA5B3]">
            Ask naturally, refine step-by-step, and give feedback on every pick.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            aria-label="Streaming region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="h-9 px-3 rounded-xl bg-[#17161D] border border-white/[0.1] text-xs text-[#F5F2F7]"
          >
            <option value="IN">Region: India (IN)</option>
            <option value="US">Region: US</option>
            <option value="GB">Region: UK (GB)</option>
            <option value="CA">Region: Canada (CA)</option>
            <option value="AU">Region: Australia (AU)</option>
          </select>

          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#17161D] hover:bg-[#1C1A23] border border-white/[0.1] text-xs font-medium text-[#AAA5B3] hover:text-[#F5F2F7] transition-colors"
          >
            <RotateCcw size={13} />
            New Chat
          </button>
        </div>
      </div>

      {/* Conversation Surface */}
      <div className="rounded-2xl bg-[#14131A] border border-white/[0.08] overflow-hidden flex flex-col min-h-[540px]">
        <div className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[68vh]">
          {!historyReady ? (
            <p className="text-xs text-[#77727F]">Loading conversation memory…</p>
          ) : messages.length === 0 ? (
            <div className="py-8 max-w-2xl mx-auto text-center space-y-5">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#8060A8]/20 border border-[#8060A8]/40 flex items-center justify-center text-[#A68BC7]">
                <Compass size={22} />
              </div>
              <div className="space-y-1.5">
                <h2 className="font-serif text-2xl font-semibold text-[#F5F2F7]">
                  What are you in the mood to discover?
                </h2>
                <p className="text-xs sm:text-sm text-[#AAA5B3]">
                  Try a natural prompt or tap a starter query below — MIRA remembers your constraints across turns.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void handleSend(prompt)}
                    className="px-3.5 py-2 rounded-full bg-[#17161D] hover:bg-[#1C1A23] border border-white/[0.1] hover:border-[#A68BC7]/60 text-xs text-[#F5F2F7] transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, mIdx) => {
              if (msg.role === 'user') {
                return (
                  <div key={mIdx} className="flex justify-end">
                    <div className="max-w-xl px-4 py-3 rounded-2xl rounded-tr-sm bg-[#8060A8] text-white text-sm leading-relaxed shadow-sm">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              const c = msg.constraints;
              const constraintPills: string[] = [];
              if (c) {
                if (c.content_type && c.content_type !== 'ALL') {
                  constraintPills.push(c.content_type.replace('_', ' '));
                }
                if (c.genres.length > 0) constraintPills.push(`Genres: ${c.genres.join(', ')}`);
                if (c.exclude_genres.length > 0) {
                  constraintPills.push(`Excluding: ${c.exclude_genres.join(', ')}`);
                }
                if (c.seed_titles.length > 0) {
                  constraintPills.push(`Like: ${c.seed_titles.join(', ')}`);
                }
                if (c.max_runtime) constraintPills.push(`Under ${c.max_runtime} min`);
                if (c.min_rating) constraintPills.push(`${c.min_rating.toFixed(1)}+ rated`);
                if (c.underrated) constraintPills.push('Underrated gems');
                if (c.surprise_different) constraintPills.push('Surprise mode');
                if (c.use_watchlist) constraintPills.push('Watchlist signals');
              }

              return (
                <div key={mIdx} className="space-y-4">
                  <div className="max-w-3xl p-4 rounded-2xl rounded-tl-sm bg-[#17161D] border border-white/[0.08] space-y-2.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A68BC7]">
                      <Sparkles size={11} />
                      MIRA
                    </div>
                    <p className="text-sm text-[#F5F2F7] leading-relaxed">{msg.content}</p>

                    {constraintPills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {constraintPills.map((pill) => (
                          <span
                            key={pill}
                            className="px-2.5 py-0.5 rounded-full bg-[#101014] border border-white/[0.08] text-[11px] text-[#AAA5B3]"
                          >
                            {pill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recommendation Cards */}
                  {msg.recommendations.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {msg.recommendations.map((rec, rIdx) => {
                        const movieObj = recToMovieSummary(rec);
                        const saved = movieObj ? isInWatchlist(movieObj.id) : false;
                        const fbKey = `${rec.content_id ?? rec.movielens_id ?? rec.title}`;
                        const fbState = feedbackMap[fbKey];
                        const detailHref = rec.content_id
                          ? `/movie/${rec.content_id}`
                          : `/discover?q=${encodeURIComponent(rec.title)}`;

                        return (
                          <article
                            key={`${mIdx}-${rIdx}-${rec.title}`}
                            className="p-4 rounded-2xl bg-[#17161D] border border-white/[0.08] hover:border-[#8060A8]/40 transition-colors flex flex-col justify-between gap-3.5"
                          >
                            <div className="flex gap-3.5">
                              <Link
                                href={detailHref}
                                className="w-20 h-30 rounded-xl overflow-hidden bg-[#101014] shrink-0 relative border border-white/[0.06]"
                              >
                                {contentImageUrl(rec.poster_url) ? (
                                  <Image
                                    src={contentImageUrl(rec.poster_url)!}
                                    alt={rec.title}
                                    fill
                                    sizes="80px"
                                    className="object-cover"
                                  />
                                ) : (
                                  <PosterFallback title={rec.title} />
                                )}
                              </Link>

                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <Link
                                    href={detailHref}
                                    className="text-sm sm:text-base font-semibold text-[#F5F2F7] hover:text-[#A68BC7] transition-colors line-clamp-1"
                                  >
                                    #{rIdx + 1} · {rec.title}
                                  </Link>
                                  {rec.rating != null && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#101014] border border-white/[0.08] text-xs font-semibold text-[#D9A45D] shrink-0">
                                      <Star size={11} className="fill-[#D9A45D]" />
                                      {rec.rating.toFixed(1)}
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-[#77727F]">
                                  {[
                                    rec.release_year,
                                    rec.content_type === 'TV_SERIES'
                                      ? 'TV Series'
                                      : rec.is_documentary
                                        ? 'Documentary'
                                        : 'Movie',
                                    rec.runtime ? `${rec.runtime}m` : null,
                                    rec.genres.slice(0, 3).join(', '),
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>

                                <p className="text-xs text-[#F5F2F7]/90 leading-relaxed">
                                  {rec.explanation}
                                </p>

                                {rec.streaming_platforms.length > 0 && (
                                  <div className="flex flex-wrap gap-1 pt-0.5">
                                    {rec.streaming_platforms.map((plat) => (
                                      <span
                                        key={plat}
                                        className="px-2 py-0.5 rounded-md bg-[#8060A8]/15 border border-[#8060A8]/30 text-[10px] font-medium text-[#A68BC7]"
                                      >
                                        {plat}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Actions + 5 Feedback Buttons */}
                            <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Link
                                    href={detailHref}
                                    onClick={() => {
                                      void import('@/services/analyticsService').then(
                                        ({ trackEvent }) => {
                                          trackEvent({
                                            event_type: 'recommendation_clicked',
                                            content_id: rec.content_id ?? null,
                                            title: rec.title,
                                            source_surface: 'mira_chat',
                                          });
                                        }
                                      );
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-[#101014] hover:bg-[#1C1A23] border border-white/[0.1] text-[11px] font-medium text-[#F5F2F7] transition-colors"
                                  >
                                    {rec.content_id ? 'View Details' : 'Find Details'}
                                  </Link>

                                  {movieObj && (
                                    <button
                                      type="button"
                                      onClick={() => toggleWatchlist(movieObj)}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                                        saved
                                          ? 'bg-[#D9A45D]/20 text-[#D9A45D] border-[#D9A45D]/40'
                                          : 'bg-[#101014] text-[#AAA5B3] border-white/[0.1] hover:text-[#F5F2F7]'
                                      }`}
                                    >
                                      {saved ? <Check size={11} /> : <Bookmark size={11} />}
                                      {saved ? 'In Watchlist' : 'Watchlist'}
                                    </button>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    title="Like"
                                    onClick={() => void handleFeedback(rec, 'like')}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition-colors ${
                                      fbState?.type === 'like'
                                        ? 'bg-[#8060A8]/30 text-white border-[#A68BC7]'
                                        : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                                    }`}
                                  >
                                    <ThumbsUp size={11} />
                                    Like
                                  </button>
                                  <button
                                    type="button"
                                    title="Dislike"
                                    onClick={() => void handleFeedback(rec, 'dislike')}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition-colors ${
                                      fbState?.type === 'dislike'
                                        ? 'bg-red-500/20 text-red-200 border-red-400/40'
                                        : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                                    }`}
                                  >
                                    <ThumbsDown size={11} />
                                    Dislike
                                  </button>
                                  <button
                                    type="button"
                                    title="Not interested"
                                    onClick={() => void handleFeedback(rec, 'not_interested')}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition-colors ${
                                      fbState?.type === 'not_interested'
                                        ? 'bg-red-500/20 text-red-200 border-red-400/40'
                                        : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                                    }`}
                                  >
                                    <XCircle size={11} />
                                    Skip
                                  </button>
                                  <button
                                    type="button"
                                    title="Already watched"
                                    onClick={() => void handleFeedback(rec, 'already_watched')}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition-colors ${
                                      fbState?.type === 'already_watched'
                                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                                        : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                                    }`}
                                  >
                                    <Eye size={11} />
                                    Watched
                                  </button>
                                  <button
                                    type="button"
                                    title="More like this"
                                    onClick={() => void handleFeedback(rec, 'more_like_this')}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition-colors ${
                                      fbState?.type === 'more_like_this'
                                        ? 'bg-[#D9A45D]/20 text-[#D9A45D] border-[#D9A45D]/40'
                                        : 'bg-[#101014] text-[#D9A45D] border-white/[0.08] hover:border-[#D9A45D]/40'
                                    }`}
                                  >
                                    <Heart size={11} />
                                    More like this
                                  </button>
                                  <button
                                    type="button"
                                    title="Less like this"
                                    onClick={() => void handleFeedback(rec, 'less_like_this')}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition-colors ${
                                      fbState?.type === 'less_like_this'
                                        ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                                        : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                                    }`}
                                  >
                                    <MinusCircle size={11} />
                                    Less like this
                                  </button>
                                </div>
                              </div>

                              {fbState && (
                                <p className="text-[11px] text-[#A68BC7]">{fbState.note}</p>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {/* Follow-up prompt + quick refinements */}
                  {(msg.follow_up_question || msg.quick_refinements.length > 0) && (
                    <div className="space-y-2 pt-1">
                      {msg.follow_up_question && (
                        <p className="text-xs text-[#AAA5B3] italic">{msg.follow_up_question}</p>
                      )}
                      {msg.quick_refinements.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {msg.quick_refinements.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              disabled={sending}
                              onClick={() => void handleSend(chip)}
                              className="px-3 py-1 rounded-full bg-[#17161D] hover:bg-[#1C1A23] border border-[#8060A8]/35 text-xs text-[#A68BC7] hover:text-[#F5F2F7] disabled:opacity-40 transition-colors"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <div className="max-w-md p-3.5 rounded-2xl bg-[#17161D] border border-white/[0.08] text-xs text-[#A68BC7] animate-pulse">
              MIRA is analyzing constraints and ranking MovieLens + Watchmode titles…
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-400/30 text-xs text-red-200">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleFormSubmit}
          className="p-3.5 sm:p-4 bg-[#17161D] border-t border-white/[0.08] flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask MIRA (e.g. 'Underrated psychological thriller', 'Something less violent', 'TV series with mystery')…"
            className="flex-1 h-11 px-4 rounded-xl bg-[#101014] border border-white/[0.1] text-sm text-[#F5F2F7] placeholder:text-[#77727F] focus:outline-none focus:border-[#8060A8]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-[#8060A8] hover:bg-[#9170ba] text-white text-sm font-semibold disabled:opacity-40 transition-colors shrink-0"
          >
            <Send size={15} />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </Container>
  );
}
