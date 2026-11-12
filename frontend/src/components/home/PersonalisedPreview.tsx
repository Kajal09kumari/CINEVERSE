'use client';

/**
 * PersonalisedPreview — Day 5 Adaptive Homepage & Taste DNA Onboarding
 *
 * Strictly data-driven:
 * - New/uninitialized users see an interactive Taste DNA Onboarding widget
 *   instead of fabricated personalized sections.
 * - Users with real signals see adaptive, deduplicated sections
 *   (Recommended For You, Because You Love <Genre>, Based on Your Taste DNA,
 *   Hidden Gems For You, Discover Something Different, Your Preferred Genres)
 *   plus Continue Exploring when unfinished watch progress exists.
 */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Eye,
  MinusCircle,
  Play,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { PosterFallback } from '@/components/movies/PosterFallback';
import {
  fetchAdaptiveHomeSections,
  recordInteraction,
  submitOnboarding,
  submitRecommendationFeedback,
} from '@/services/miraService';
import { getActiveUserId, subscribeActiveUserId } from '@/lib/userContext';
import type {
  AdaptiveHomepageResponse,
  FeedbackType,
  RecommendedTitleCard,
} from '@/types';

const ONBOARDING_GENRES = [
  'Sci-Fi',
  'Thriller',
  'Mystery',
  'Drama',
  'Comedy',
  'Action',
  'Crime',
  'Documentary',
  'Animation',
  'Romance',
  'Horror',
  'Fantasy',
];

const ONBOARDING_THEMES = [
  'mind-bending',
  'time travel',
  'character study',
  'slow burn',
  'true story',
  'heist',
  'cyberpunk',
  'feel-good',
];

const ONBOARDING_TYPES = [
  { value: 'MOVIE', label: 'Movies' },
  { value: 'TV_SERIES', label: 'TV Series' },
  { value: 'DOCUMENTARY', label: 'Documentaries' },
];

export function PersonalisedPreview() {
  const [data, setData] = useState<AdaptiveHomepageResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Onboarding form state
  const [selGenres, setSelGenres] = useState<string[]>(['Sci-Fi', 'Thriller']);
  const [selThemes, setSelThemes] = useState<string[]>(['mind-bending']);
  const [selTypes, setSelTypes] = useState<string[]>(['MOVIE', 'TV_SERIES', 'DOCUMENTARY']);
  const [selLangs, setSelLangs] = useState<string>('en');
  const [selEra, setSelEra] = useState<string>('2010s');
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);

  const loadAdaptiveHome = useCallback(() => {
    const uid = getActiveUserId();
    fetchAdaptiveHomeSections({ userId: uid, perSectionK: 4 })
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    loadAdaptiveHome();
    return subscribeActiveUserId(loadAdaptiveHome);
  }, [loadAdaptiveHome]);

  function toggleValue(list: string[], val: string, setter: (next: string[]) => void) {
    setter(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  }

  async function handleOnboardingSubmit() {
    if (selGenres.length === 0) return;
    setSubmittingOnboarding(true);
    try {
      const uid = getActiveUserId();
      await submitOnboarding({
        user_id: uid,
        preferred_genres: selGenres,
        preferred_types: selTypes.length > 0 ? selTypes : ['MOVIE'],
        preferred_languages: selLangs
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
        favorite_themes: selThemes,
        preferred_era: selEra,
      });
      setFeedbackBanner('Taste DNA initialized! Updating your personalized homepage.');
      loadAdaptiveHome();
    } finally {
      setSubmittingOnboarding(false);
    }
  }

  async function handleInlineFeedback(card: RecommendedTitleCard, ftype: FeedbackType) {
    const uid = getActiveUserId();
    try {
      const res = await submitRecommendationFeedback({
        user_id: uid,
        feedback_type: ftype,
        content_id: card.content_id,
        movielens_movie_id: card.movielens_id,
        title: card.title,
      });
      setFeedbackBanner(`${card.title}: ${res.profile_note}`);
      loadAdaptiveHome();
    } catch {
      // ignore transient errors
    }
  }

  async function handleMarkFinished(contentId: number | null, title: string) {
    const uid = getActiveUserId();
    await recordInteraction({
      user_id: uid,
      content_id: contentId,
      title,
      interaction_type: 'progress',
      progress_pct: 100,
    });
    loadAdaptiveHome();
  }

  return (
    <section id="personalized-picks" className="py-16 sm:py-20 border-t border-white/[0.06]">
      <Container className="space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.22em] uppercase text-[#A68BC7]">
              <Sparkles size={12} />
              {data?.has_sufficient_data ? 'Live Taste DNA Personalization' : 'Taste DNA Onboarding'}
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#F5F2F7] tracking-tight">
              {data?.has_sufficient_data ? 'Your Personalized Discovery' : 'Build Your Taste DNA'}
            </h2>
            <p className="text-sm text-[#AAA5B3]">
              {data?.has_sufficient_data
                ? data.taste_dna_summary
                : 'No viewing or preference signals recorded yet. Tell CINEVERSE what you enjoy to unlock adaptive recommendations.'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#AAA5B3] hover:text-[#F5F2F7] transition-colors"
            >
              View Taste DNA
            </Link>
            <Link
              href="/assistant"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D9A45D] hover:text-[#e7b978] transition-colors"
            >
              Ask MIRA
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {feedbackBanner && (
          <div className="px-4 py-2.5 rounded-xl bg-[#9F83C2]/15 border border-[#9F83C2]/35 text-xs text-[#E4D9F2]">
            {feedbackBanner}
          </div>
        )}

        {!loaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-44 rounded-2xl bg-[#17161D] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : !data ? (
          <div className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-[#AAA5B3]">
              Personalized Taste DNA picks appear once the FastAPI recommendation engine is reachable.
            </p>
            <Link
              href="/assistant"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A68BC7] hover:underline"
            >
              Open MIRA Assistant
              <ArrowRight size={13} />
            </Link>
          </div>
        ) : (
          <>
            {/* Continue Exploring (only rendered when unfinished watch progress/views exist) */}
            {data.continue_exploring.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-[#F5F2F7]">Continue Exploring</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {data.continue_exploring.map((entry, idx) => {
                    const inter = entry.interaction;
                    const cid = inter.content_id;
                    const title = entry.content?.title || inter.title || 'Untitled';
                    const pct = Math.round(inter.progress_pct || 0);
                    return (
                      <div
                        key={`${cid ?? title}-${idx}`}
                        className="p-4 rounded-xl bg-[#17161D] border border-white/[0.08] space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#F5F2F7] truncate">{title}</p>
                            <p className="text-[11px] text-[#7D7888]">
                              {inter.interaction_type === 'progress'
                                ? `${pct}% watched`
                                : 'Recently viewed'}
                            </p>
                          </div>
                          {cid && (
                            <Link
                              href={`/movie/${cid}`}
                              className="p-1.5 rounded-lg bg-[#D9A45D]/15 text-[#D9A45D] hover:bg-[#D9A45D]/25"
                              title="Resume title"
                            >
                              <Play size={13} />
                            </Link>
                          )}
                        </div>
                        {inter.interaction_type === 'progress' && (
                          <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                            <div
                              className="h-full bg-[#D9A45D]"
                              style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleMarkFinished(cid, title)}
                          className="text-[11px] text-[#AAA5B3] hover:text-[#F5F2F7]"
                        >
                          Mark completed
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Interactive Onboarding for New Users (Zero fake sections) */}
            {(!data.has_sufficient_data || data.show_onboarding) && (
              <div
                id="taste-onboarding-card"
                className="p-6 sm:p-8 rounded-2xl bg-[#17161D] border border-[#9F83C2]/30 space-y-6"
              >
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold text-[#F5F2F7]">
                    Quick Taste Calibration
                  </h3>
                  <p className="text-xs text-[#AAA5B3]">
                    Select your favorite genres, themes, and formats to initialize your Taste DNA profile.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-medium text-[#D8D3DE]">Favorite Genres</p>
                  <div className="flex flex-wrap gap-2">
                    {ONBOARDING_GENRES.map((genre) => {
                      const active = selGenres.includes(genre);
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => toggleValue(selGenres, genre, setSelGenres)}
                          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                            active
                              ? 'bg-[#9F83C2]/25 border-[#9F83C2] text-[#F5F2F7]'
                              : 'bg-white/[0.03] border-white/[0.08] text-[#AAA5B3] hover:text-[#F5F2F7]'
                          }`}
                        >
                          {active && <Check size={11} className="inline mr-1" />}
                          {genre}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-medium text-[#D8D3DE]">Themes & Storytelling Vibes</p>
                  <div className="flex flex-wrap gap-2">
                    {ONBOARDING_THEMES.map((theme) => {
                      const active = selThemes.includes(theme);
                      return (
                        <button
                          key={theme}
                          type="button"
                          onClick={() => toggleValue(selThemes, theme, setSelThemes)}
                          className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                            active
                              ? 'bg-[#D9A45D]/20 border-[#D9A45D] text-[#F5F2F7]'
                              : 'bg-white/[0.03] border-white/[0.08] text-[#AAA5B3]'
                          }`}
                        >
                          {theme}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-[#D8D3DE]">Formats</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ONBOARDING_TYPES.map((t) => {
                        const active = selTypes.includes(t.value);
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => toggleValue(selTypes, t.value, setSelTypes)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] border ${
                              active
                                ? 'bg-[#9F83C2]/20 border-[#9F83C2]/60 text-[#F5F2F7]'
                                : 'bg-white/[0.02] border-white/[0.08] text-[#AAA5B3]'
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#D8D3DE]">Languages (ISO)</label>
                    <input
                      type="text"
                      value={selLangs}
                      onChange={(e) => setSelLangs(e.target.value)}
                      placeholder="en, hi, ja"
                      className="w-full h-9 px-3 rounded-lg bg-[#121116] border border-white/[0.1] text-xs text-[#F5F2F7]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#D8D3DE]">Preferred Era</label>
                    <select
                      value={selEra}
                      onChange={(e) => setSelEra(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#121116] border border-white/[0.1] text-xs text-[#F5F2F7]"
                    >
                      <option value="2020s">2020s & New</option>
                      <option value="2010s">2010s Modern</option>
                      <option value="2000s">2000s</option>
                      <option value="1990s">1990s Classics</option>
                      <option value="1980s">1980s & Earlier</option>
                    </select>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOnboardingSubmit}
                  disabled={submittingOnboarding || selGenres.length === 0}
                >
                  {submittingOnboarding ? 'Building Taste DNA…' : 'Build My Taste DNA'}
                </Button>
              </div>
            )}

            {/* Dynamic Adaptive Homepage Sections */}
            {data.has_sufficient_data &&
              data.sections.map((section) => (
                <div key={section.section_id} className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                    <h3 className="text-xl font-semibold text-[#F5F2F7]">{section.title}</h3>
                    <p className="text-xs text-[#9E97A8]">{section.subtitle}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {section.items.map((item) => {
                      const href = item.content_id
                        ? `/movie/${item.content_id}`
                        : `/discover?query=${encodeURIComponent(item.title)}`;
                      return (
                        <div
                          key={`${section.section_id}-${item.title}-${item.movielens_id ?? item.content_id}`}
                          className="group flex flex-col gap-3 p-4 rounded-2xl bg-[#17161D] border border-white/[0.07] hover:border-[#9F83C2]/40 transition-all"
                        >
                          <div className="flex gap-4">
                            <Link
                              href={href}
                              className="relative w-20 h-28 shrink-0 rounded-xl overflow-hidden bg-[#1D1B25]"
                            >
                              {item.poster_url ? (
                                <Image
                                  src={item.poster_url}
                                  alt={item.title}
                                  fill
                                  sizes="80px"
                                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <PosterFallback title={item.title} />
                              )}
                            </Link>

                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <Link href={href} className="min-w-0">
                                  <h4 className="text-sm font-semibold text-[#F5F2F7] group-hover:text-[#D9A45D] transition-colors truncate">
                                    {item.title}
                                  </h4>
                                </Link>
                                {item.rating != null && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#D9A45D] shrink-0">
                                    <Star size={11} className="fill-[#D9A45D]" />
                                    {item.rating.toFixed(1)}
                                  </span>
                                )}
                              </div>

                              <p className="text-[11px] text-[#7D7888]">
                                {item.release_year ?? '—'} ·{' '}
                                {item.is_documentary
                                  ? 'Documentary'
                                  : item.content_type === 'TV_SERIES'
                                    ? 'TV Series'
                                    : 'Movie'}
                                {item.genres.length > 0 ? ` · ${item.genres.slice(0, 2).join(', ')}` : ''}
                              </p>

                              <p className="text-xs text-[#AAA5B3] line-clamp-2 leading-relaxed">
                                {item.explanation}
                              </p>
                            </div>
                          </div>

                          {/* Inline 6-action feedback controls */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/[0.06]">
                            <button
                              type="button"
                              onClick={() => void handleInlineFeedback(item, 'like')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white/[0.04] hover:bg-emerald-500/20 text-[#CCC7D4]"
                            >
                              <ThumbsUp size={11} />
                              Like
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleInlineFeedback(item, 'dislike')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white/[0.04] hover:bg-rose-500/20 text-[#CCC7D4]"
                            >
                              <ThumbsDown size={11} />
                              Dislike
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleInlineFeedback(item, 'already_watched')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white/[0.04] hover:bg-white/[0.1] text-[#CCC7D4]"
                            >
                              <Eye size={11} />
                              Watched
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleInlineFeedback(item, 'more_like_this')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white/[0.04] hover:bg-[#9F83C2]/25 text-[#CCC7D4]"
                            >
                              <Sparkles size={11} />
                              More like this
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleInlineFeedback(item, 'less_like_this')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white/[0.04] hover:bg-amber-500/20 text-[#CCC7D4]"
                            >
                              <MinusCircle size={11} />
                              Less like this
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </>
        )}
      </Container>
    </section>
  );
}
