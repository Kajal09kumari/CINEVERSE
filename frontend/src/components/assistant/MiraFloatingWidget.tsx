'use client';

/**
 * MiraFloatingWidget — Floating AI Chat Widget for CINEVERSE
 *
 * Requirements fulfilled:
 * - Floating panel in the LOWER-RIGHT CORNER of the screen.
 * - Sits above the current page without navigating away.
 * - Background page stays fully visible and interactive.
 * - Premium dark cinematic UI matching CINEVERSE design system.
 * - Smooth open/close/minimize animations with framer-motion.
 * - Close (X) button, Minimize button, New Chat reset.
 * - Mobile responsive (adapts to screen width with clean margins).
 * - Subtle floating MIRA launcher button at bottom-right when closed.
 * - 4 required starter prompts:
 *   1. "Recommend a thriller movie."
 *   2. "Suggest underrated documentaries."
 *   3. "Find something similar to Interstellar."
 *   4. "Recommend a series for the weekend."
 * - Full FastAPI backend integration with streaming availability and MovieLens ML.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark,
  Check,
  Eye,
  Heart,
  Maximize2,
  Minus,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  X,
  Compass,
} from 'lucide-react';
import { useMiraWidget } from '@/context/MiraWidgetContext';
import { useWatchlist } from '@/hooks/useWatchlist';
import { PosterFallback } from '@/components/movies/PosterFallback';
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
  'Recommend a thriller movie.',
  'Suggest underrated documentaries.',
  'Find something similar to Interstellar.',
  'Recommend a series for the weekend.',
] as const;

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

export function MiraFloatingWidget() {
  const {
    isOpen,
    isMinimized,
    openMira,
    closeMira,
    minimizeMira,
    maximizeMira,
    queuedPrompt,
    clearQueuedPrompt,
  } = useMiraWidget();

  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const [sessionId] = useState<string>(() => getOrCreateSessionId());
  const [region, setRegion] = useState<string>('IN');
  const [messages, setMessages] = useState<MiraMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [historyReady, setHistoryReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<
    Record<string, { type: FeedbackType; note: string }>
  >({});

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
          top_k: 5,
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
            : 'Unable to reach MIRA right now. Please check that the backend is running.'
        );
      } finally {
        setSending(false);
      }
    },
    [region, sending, sessionId]
  );

  // Initialize session and hydrate history
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const hist = await fetchMiraHistory(sessionId, getActiveUserId());
        if (!active) return;
        setMessages(hist.messages ?? []);
        setHistoryReady(true);
      } catch {
        if (!active) return;
        setHistoryReady(true);
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Handle queued prompt from other components
  useEffect(() => {
    if (queuedPrompt && isOpen && !isMinimized && !sending) {
      const p = queuedPrompt;
      clearQueuedPrompt();
      const timer = setTimeout(() => {
        void handleSend(p);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [queuedPrompt, isOpen, isMinimized, sending, handleSend, clearQueuedPrompt]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMinimized]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen && !isMinimized) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, sending, isOpen, isMinimized]);

  async function handleNewChat() {
    setError(null);
    setFeedbackMap({});
    try {
      await clearMiraHistory(sessionId, getActiveUserId());
    } catch {
      // Proceed gracefully
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
        [itemKey]: { type, note: 'Feedback saved' },
      }));
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void handleSend(input);
  }

  return (
    <>
      {/* ── State 1: Floating Launcher Button (when closed) ────────────────── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40"
          >
            <button
              type="button"
              onClick={() => openMira()}
              aria-label="Open MIRA AI Assistant"
              className="group relative flex items-center gap-2.5 px-4 sm:px-4.5 py-3 rounded-full bg-[#17161D] hover:bg-[#1E1C25] border border-[#8060A8]/45 hover:border-[#8060A8] text-[#F5F2F7] shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(128,96,168,0.25)] hover:shadow-[0_8px_35px_rgba(0,0,0,0.6),0_0_30px_rgba(128,96,168,0.4)] transition-all duration-300"
            >
              {/* Pulsing glow background */}
              <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-[#8060A8]/30 to-[#A68BC7]/30 blur-sm opacity-70 group-hover:opacity-100 transition duration-300 pointer-events-none" />

              <div className="relative w-7 h-7 rounded-full bg-[#8060A8] flex items-center justify-center text-[#101014] shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                <Sparkles size={15} strokeWidth={2.4} />
              </div>
              <div className="relative flex flex-col text-left">
                <span className="text-xs font-bold tracking-wider text-[#F5F2F7]">
                  MIRA
                </span>
                <span className="text-[10px] text-[#A68BC7] hidden sm:inline leading-none">
                  AI Film Guide
                </span>
              </div>
              <span className="relative w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── State 2: Minimized Floating Bar (when open & minimized) ────────── */}
      <AnimatePresence>
        {isOpen && isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#17161D]/95 backdrop-blur-xl border border-white/[0.14] shadow-2xl text-[#F5F2F7]"
          >
            <div className="flex items-center gap-2 cursor-pointer" onClick={maximizeMira}>
              <div className="w-6 h-6 rounded-lg bg-[#8060A8] flex items-center justify-center text-[#101014]">
                <Sparkles size={13} strokeWidth={2.2} />
              </div>
              <span className="text-xs font-semibold tracking-wide">MIRA Active</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <div className="h-4 w-px bg-white/[0.12] mx-0.5" />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={maximizeMira}
                className="p-1 rounded-md text-[#AAA5B3] hover:text-[#F5F2F7] hover:bg-white/[0.08] transition-colors"
                title="Expand MIRA"
                aria-label="Expand MIRA"
              >
                <Maximize2 size={13} />
              </button>
              <button
                type="button"
                onClick={closeMira}
                className="p-1 rounded-md text-[#AAA5B3] hover:text-[#F5F2F7] hover:bg-white/[0.08] transition-colors"
                title="Close MIRA"
                aria-label="Close MIRA"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── State 3: Floating Chat Panel (when open & maximized) ───────────── */}
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.aside
            key="mira-floating-panel"
            initial={{ opacity: 0, y: 25, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-24px)] sm:w-[430px] md:w-[450px] h-[580px] sm:h-[630px] max-h-[calc(100vh-80px)] rounded-2xl bg-[#14131A]/95 backdrop-blur-2xl border border-white/[0.14] shadow-[0_25px_60px_rgba(0,0,0,0.7),0_0_35px_rgba(128,96,168,0.22)] flex flex-col overflow-hidden"
            role="dialog"
            aria-label="MIRA AI Chat Widget"
            aria-modal="false"
          >
            {/* Header */}
            <header className="px-4 py-3 bg-[#17161D] border-b border-white/[0.08] flex items-center justify-between gap-2 select-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#8060A8] flex items-center justify-center text-[#101014] flex-shrink-0">
                  <Sparkles size={15} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-sm font-bold text-[#F5F2F7] tracking-wider truncate">
                      MIRA
                    </h2>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#101014] border border-white/[0.08] text-[9px] font-semibold text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live
                    </span>
                  </div>
                  <p className="text-[10px] text-[#AAA5B3] truncate">
                    FastAPI · MovieLens · Watchmode
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <select
                  aria-label="Streaming region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="h-7 px-2 rounded-lg bg-[#101014] border border-white/[0.1] text-[10px] font-medium text-[#F5F2F7] focus:outline-none focus:border-[#8060A8]"
                  title="Streaming Region"
                >
                  <option value="IN">IN</option>
                  <option value="US">US</option>
                  <option value="GB">GB</option>
                  <option value="CA">CA</option>
                  <option value="AU">AU</option>
                </select>

                <button
                  type="button"
                  onClick={handleNewChat}
                  className="h-7 px-2 rounded-lg bg-[#101014] hover:bg-[#1E1C25] border border-white/[0.08] text-[11px] text-[#AAA5B3] hover:text-[#F5F2F7] transition-colors flex items-center gap-1"
                  title="New Conversation"
                  aria-label="New Conversation"
                >
                  <RotateCcw size={11} />
                  <span className="hidden sm:inline">New</span>
                </button>

                <button
                  type="button"
                  onClick={minimizeMira}
                  className="w-7 h-7 rounded-lg bg-[#101014] hover:bg-[#1E1C25] border border-white/[0.08] text-[#AAA5B3] hover:text-[#F5F2F7] transition-colors flex items-center justify-center"
                  title="Minimize"
                  aria-label="Minimize MIRA panel"
                >
                  <Minus size={13} />
                </button>

                <button
                  type="button"
                  onClick={closeMira}
                  className="w-7 h-7 rounded-lg bg-[#101014] hover:bg-red-500/20 hover:border-red-500/30 border border-white/[0.08] text-[#AAA5B3] hover:text-red-300 transition-colors flex items-center justify-center"
                  title="Close"
                  aria-label="Close MIRA panel"
                >
                  <X size={14} />
                </button>
              </div>
            </header>

            {/* Scrollable Message Surface */}
            <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-4 text-xs sm:text-sm">
              {!historyReady ? (
                <div className="py-12 text-center text-xs text-[#77727F]">
                  Connecting to MIRA memory…
                </div>
              ) : messages.length === 0 ? (
                /* Welcome Screen with Required 4 Starter Prompts */
                <div className="py-5 px-1 space-y-4 text-center">
                  <div className="w-11 h-11 mx-auto rounded-2xl bg-[#8060A8]/20 border border-[#8060A8]/40 flex items-center justify-center text-[#A68BC7]">
                    <Compass size={20} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-serif text-lg font-semibold text-[#F5F2F7]">
                      What would you like to watch?
                    </h3>
                    <p className="text-xs text-[#AAA5B3] max-w-xs mx-auto leading-relaxed">
                      Ask naturally or tap a recommendation prompt below:
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-2 text-left">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void handleSend(prompt)}
                        className="group flex items-center justify-between p-2.5 rounded-xl bg-[#17161D] hover:bg-[#1F1D27] border border-white/[0.08] hover:border-[#8060A8]/50 transition-all duration-200 text-left"
                      >
                        <span className="text-xs text-[#F5F2F7] group-hover:text-[#A68BC7] transition-colors line-clamp-1">
                          {prompt}
                        </span>
                        <Sparkles
                          size={12}
                          className="text-[#77727F] group-hover:text-[#A68BC7] flex-shrink-0 transition-colors"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, mIdx) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={mIdx} className="flex justify-end">
                        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-[#8060A8] text-white text-xs sm:text-sm leading-relaxed shadow-sm">
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
                    if (c.genres && c.genres.length > 0) {
                      constraintPills.push(`Genres: ${c.genres.join(', ')}`);
                    }
                    if (c.exclude_genres && c.exclude_genres.length > 0) {
                      constraintPills.push(`Excluding: ${c.exclude_genres.join(', ')}`);
                    }
                    if (c.seed_titles && c.seed_titles.length > 0) {
                      constraintPills.push(`Like: ${c.seed_titles.join(', ')}`);
                    }
                    if (c.max_runtime) constraintPills.push(`Under ${c.max_runtime}m`);
                    if (c.min_rating) constraintPills.push(`${c.min_rating.toFixed(1)}+ rated`);
                    if (c.underrated) constraintPills.push('Underrated');
                    if (c.surprise_different) constraintPills.push('Surprise mode');
                  }

                  return (
                    <div key={mIdx} className="space-y-3">
                      {/* Assistant text message */}
                      <div className="max-w-[92%] p-3 rounded-2xl rounded-tl-sm bg-[#17161D] border border-white/[0.08] space-y-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#A68BC7]">
                          <Sparkles size={10} />
                          MIRA
                        </div>
                        <p className="text-xs sm:text-sm text-[#F5F2F7] leading-relaxed">
                          {msg.content}
                        </p>

                        {constraintPills.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {constraintPills.map((pill) => (
                              <span
                                key={pill}
                                className="px-2 py-0.5 rounded-full bg-[#101014] border border-white/[0.08] text-[10px] text-[#AAA5B3]"
                              >
                                {pill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Title Recommendations */}
                      {msg.recommendations && msg.recommendations.length > 0 && (
                        <div className="space-y-2.5">
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
                                className="p-3 rounded-xl bg-[#17161D] border border-white/[0.08] hover:border-[#8060A8]/40 transition-colors flex flex-col gap-2.5"
                              >
                                <div className="flex gap-2.5">
                                  <Link
                                    href={detailHref}
                                    className="w-16 h-24 rounded-lg overflow-hidden bg-[#101014] shrink-0 relative border border-white/[0.06]"
                                  >
                                    {contentImageUrl(rec.poster_url) ? (
                                      <Image
                                        src={contentImageUrl(rec.poster_url)!}
                                        alt={rec.title}
                                        fill
                                        sizes="64px"
                                        className="object-cover"
                                      />
                                    ) : (
                                      <PosterFallback title={rec.title} />
                                    )}
                                  </Link>

                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-start justify-between gap-1.5">
                                      <Link
                                        href={detailHref}
                                        className="text-xs sm:text-sm font-semibold text-[#F5F2F7] hover:text-[#A68BC7] transition-colors line-clamp-1"
                                      >
                                        #{rIdx + 1} · {rec.title}
                                      </Link>
                                      {rec.rating != null && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#101014] border border-white/[0.08] text-[10px] font-semibold text-[#D9A45D] shrink-0">
                                          <Star size={9} className="fill-[#D9A45D]" />
                                          {rec.rating.toFixed(1)}
                                        </span>
                                      )}
                                    </div>

                                    <p className="text-[10px] text-[#77727F]">
                                      {[
                                        rec.release_year,
                                        rec.content_type === 'TV_SERIES'
                                          ? 'Series'
                                          : rec.is_documentary
                                            ? 'Doc'
                                            : 'Movie',
                                        rec.runtime ? `${rec.runtime}m` : null,
                                        rec.genres.slice(0, 2).join(', '),
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </p>

                                    <p className="text-[11px] text-[#F5F2F7]/90 leading-snug line-clamp-2">
                                      {rec.explanation}
                                    </p>

                                    {rec.streaming_platforms &&
                                      rec.streaming_platforms.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-0.5">
                                          {rec.streaming_platforms.slice(0, 3).map((plat) => (
                                            <span
                                              key={plat}
                                              className="px-1.5 py-0.5 rounded bg-[#8060A8]/15 border border-[#8060A8]/30 text-[9px] font-medium text-[#A68BC7]"
                                            >
                                              {plat}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                                </div>

                                {/* Actions & Feedback Row */}
                                <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1">
                                    <Link
                                      href={detailHref}
                                      className="px-2 py-0.5 rounded-md bg-[#101014] hover:bg-[#1E1C25] border border-white/[0.08] text-[10px] font-medium text-[#F5F2F7] transition-colors"
                                    >
                                      Details
                                    </Link>
                                    {movieObj && (
                                      <button
                                        type="button"
                                        onClick={() => toggleWatchlist(movieObj)}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors ${
                                          saved
                                            ? 'bg-[#D9A45D]/20 text-[#D9A45D] border-[#D9A45D]/40'
                                            : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                                        }`}
                                      >
                                        {saved ? <Check size={10} /> : <Bookmark size={10} />}
                                        {saved ? 'Saved' : 'Watchlist'}
                                      </button>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      title="Like"
                                      onClick={() => void handleFeedback(rec, 'like')}
                                      className={`p-1 rounded-md border text-[10px] transition-colors ${
                                        fbState?.type === 'like'
                                          ? 'bg-[#8060A8]/40 text-white border-[#A68BC7]'
                                          : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                                      }`}
                                    >
                                      <ThumbsUp size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Dislike"
                                      onClick={() => void handleFeedback(rec, 'dislike')}
                                      className={`p-1 rounded-md border text-[10px] transition-colors ${
                                        fbState?.type === 'dislike'
                                          ? 'bg-red-500/20 text-red-200 border-red-400/40'
                                          : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                                      }`}
                                    >
                                      <ThumbsDown size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Watched"
                                      onClick={() => void handleFeedback(rec, 'already_watched')}
                                      className={`p-1 rounded-md border text-[10px] transition-colors ${
                                        fbState?.type === 'already_watched'
                                          ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                                          : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                                      }`}
                                    >
                                      <Eye size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      title="More like this"
                                      onClick={() => void handleFeedback(rec, 'more_like_this')}
                                      className={`p-1 rounded-md border text-[10px] transition-colors ${
                                        fbState?.type === 'more_like_this'
                                          ? 'bg-[#D9A45D]/20 text-[#D9A45D] border-[#D9A45D]/40'
                                          : 'bg-[#101014] text-[#D9A45D] border-white/[0.08] hover:border-[#D9A45D]/40'
                                      }`}
                                    >
                                      <Heart size={11} />
                                    </button>
                                  </div>
                                </div>

                                {fbState && (
                                  <p className="text-[10px] text-[#A68BC7] italic">
                                    {fbState.note}
                                  </p>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      )}

                      {/* Follow-up question & quick refinement chips */}
                      {(msg.follow_up_question ||
                        (msg.quick_refinements && msg.quick_refinements.length > 0)) && (
                        <div className="space-y-1.5 pt-1">
                          {msg.follow_up_question && (
                            <p className="text-[11px] text-[#AAA5B3] italic">
                              {msg.follow_up_question}
                            </p>
                          )}
                          {msg.quick_refinements && msg.quick_refinements.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {msg.quick_refinements.map((chip) => (
                                <button
                                  key={chip}
                                  type="button"
                                  disabled={sending}
                                  onClick={() => void handleSend(chip)}
                                  className="px-2.5 py-1 rounded-full bg-[#17161D] hover:bg-[#1E1C25] border border-[#8060A8]/40 text-[11px] text-[#A68BC7] hover:text-[#F5F2F7] disabled:opacity-40 transition-colors"
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
                <div className="max-w-[85%] p-3 rounded-2xl bg-[#17161D] border border-white/[0.08] text-xs text-[#A68BC7] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#A68BC7] animate-ping" />
                  MIRA is researching titles across Watchmode &amp; MovieLens…
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-400/30 text-xs text-red-200">
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input Composer */}
            <form
              onSubmit={handleFormSubmit}
              className="p-3 bg-[#17161D] border-t border-white/[0.08] flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask MIRA (e.g. 'Underrated sci-fi', '90s comedy')..."
                className="flex-1 h-10 px-3.5 rounded-xl bg-[#101014] border border-white/[0.1] text-xs sm:text-sm text-[#F5F2F7] placeholder:text-[#77727F] focus:outline-none focus:border-[#8060A8]"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="w-10 h-10 rounded-xl bg-[#8060A8] hover:bg-[#9170ba] text-white flex items-center justify-center disabled:opacity-40 transition-colors flex-shrink-0"
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
