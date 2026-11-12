'use client';

/**
 * Profile & Taste DNA Dashboard (Day 5)
 *
 * Displays the user's live Taste DNA entertainment profile computed from real
 * signals, supports multi-user profile switching, preference tuning,
 * interaction history inspection, personalization reset, and ML metrics.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Check,
  Dna,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import {
  deleteUserRating,
  fetchUserPreferences,
  fetchUserRatings,
  updateUserPreferences,
} from '@/services/libraryService';
import {
  fetchInteractions,
  fetchTasteDna,
  getModelMetrics,
  listRecommendationFeedback,
  resetPersonalization,
  submitOnboarding,
} from '@/services/miraService';
import {
  getActiveUserId,
  setActiveUserId,
  subscribeActiveUserId,
} from '@/lib/userContext';
import type {
  FeedbackRecord,
  InteractionRecord,
  TasteDnaProfile,
  UserPreferences,
  UserRatingEntry,
} from '@/types';

const PROFILE_PRESETS = [
  { id: 'local-default', label: 'Primary Profile' },
  { id: 'cinephile-guest', label: 'Cinephile Guest' },
  { id: 'explorer-guest', label: 'Weekend Explorer' },
];

const GENRE_CHOICES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
];

const FORMAT_CHOICES = [
  { value: 'MOVIE', label: 'Movies' },
  { value: 'TV_SERIES', label: 'TV Series' },
  { value: 'DOCUMENTARY', label: 'Documentaries' },
];

const THEME_SUGGESTIONS = [
  'mind-bending',
  'time travel',
  'character study',
  'slow burn',
  'true story',
  'heist',
  'cyberpunk',
  'feel-good',
];

export default function ProfilePage() {
  const [activeUser, setActiveUser] = useState<string>('local-default');
  const [tasteDna, setTasteDna] = useState<TasteDnaProfile | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [ratings, setRatings] = useState<UserRatingEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [interactions, setInteractions] = useState<InteractionRecord[]>([]);
  const [metrics, setMetrics] = useState<{
    model: string;
    dataset: Record<string, number | string>;
    evaluation: Record<string, number>;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback((uid: string) => {
    setActiveUser(uid);
    Promise.allSettled([
      fetchTasteDna(uid),
      fetchUserPreferences(uid),
      fetchUserRatings(uid),
      listRecommendationFeedback(uid),
      fetchInteractions(uid, 20),
      getModelMetrics(),
    ]).then(([dnaRes, pRes, rRes, fRes, iRes, mRes]) => {
      if (dnaRes.status === 'fulfilled') setTasteDna(dnaRes.value);
      if (pRes.status === 'fulfilled') setPrefs(pRes.value);
      if (rRes.status === 'fulfilled') setRatings(rRes.value);
      if (fRes.status === 'fulfilled') setFeedback(fRes.value);
      if (iRes.status === 'fulfilled') setInteractions(iRes.value);
      if (mRes.status === 'fulfilled') setMetrics(mRes.value);
    });
  }, []);

  useEffect(() => {
    const sync = () => loadAll(getActiveUserId());
    sync();
    return subscribeActiveUserId(sync);
  }, [loadAll]);

  function switchProfile(uid: string) {
    setNotice(null);
    setActiveUserId(uid);
  }

  function togglePreferredGenre(genre: string) {
    if (!prefs) return;
    const exists = prefs.preferred_genres.includes(genre);
    const nextPref = exists
      ? prefs.preferred_genres.filter((g) => g !== genre)
      : [...prefs.preferred_genres, genre];
    const nextDisliked = prefs.disliked_genres.filter((g) => g !== genre);
    setPrefs({ ...prefs, preferred_genres: nextPref, disliked_genres: nextDisliked });
  }

  function toggleDislikedGenre(genre: string) {
    if (!prefs) return;
    const exists = prefs.disliked_genres.includes(genre);
    const nextDisliked = exists
      ? prefs.disliked_genres.filter((g) => g !== genre)
      : [...prefs.disliked_genres, genre];
    const nextPref = prefs.preferred_genres.filter((g) => g !== genre);
    setPrefs({ ...prefs, preferred_genres: nextPref, disliked_genres: nextDisliked });
  }

  function toggleFormat(fmt: string) {
    if (!prefs) return;
    const exists = prefs.preferred_types.includes(fmt);
    const next = exists
      ? prefs.preferred_types.filter((t) => t !== fmt)
      : [...prefs.preferred_types, fmt];
    setPrefs({ ...prefs, preferred_types: next.length > 0 ? next : ['MOVIE'] });
  }

  function toggleTheme(theme: string) {
    if (!prefs) return;
    const cur = prefs.favorite_themes ?? [];
    const next = cur.includes(theme) ? cur.filter((t) => t !== theme) : [...cur, theme];
    setPrefs({ ...prefs, favorite_themes: next });
  }

  async function handleSavePreferences() {
    if (!prefs) return;
    setSaving(true);
    setNotice(null);
    try {
      const updated = await updateUserPreferences(
        {
          preferred_genres: prefs.preferred_genres,
          disliked_genres: prefs.disliked_genres,
          preferred_types: prefs.preferred_types,
          preferred_languages: prefs.preferred_languages,
          min_rating: prefs.min_rating ?? 6.5,
          favorite_themes: prefs.favorite_themes ?? [],
          preferred_era: prefs.preferred_era ?? '',
          onboarding_completed:
            prefs.onboarding_completed || prefs.preferred_genres.length > 0,
          discovery_openness: prefs.discovery_openness ?? 0.35,
        },
        activeUser
      );
      setPrefs(updated);
      const freshDna = await fetchTasteDna(activeUser);
      setTasteDna(freshDna);
      setNotice('Preferences & Taste DNA updated. Homepage and MIRA will adapt immediately.');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickOnboarding() {
    if (!prefs) return;
    const genres = prefs.preferred_genres.length > 0 ? prefs.preferred_genres : ['Sci-Fi', 'Thriller'];
    const dna = await submitOnboarding({
      user_id: activeUser,
      preferred_genres: genres,
      preferred_types: prefs.preferred_types,
      favorite_themes: prefs.favorite_themes?.length ? prefs.favorite_themes : ['mind-bending'],
      preferred_languages: prefs.preferred_languages,
      preferred_era: prefs.preferred_era || '2010s',
      min_rating: prefs.min_rating ?? 6.5,
      discovery_openness: prefs.discovery_openness ?? 0.35,
    });
    setTasteDna(dna);
    loadAll(activeUser);
    setNotice('Onboarding completed and Taste DNA initialized.');
  }

  async function handleResetPersonalization() {
    setResetting(true);
    setNotice(null);
    try {
      await resetPersonalization(activeUser);
      loadAll(activeUser);
      setNotice(`Personalization profile reset for "${activeUser}".`);
    } finally {
      setResetting(false);
    }
  }

  async function handleRemoveRating(contentId: number) {
    await deleteUserRating(contentId, activeUser);
    loadAll(activeUser);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#101014] text-[#F5F2F7] overflow-x-hidden">
      <Navbar />
      <main className="flex-1 min-w-0 pt-28 pb-20">
        <Container className="space-y-10">
        {/* Header + Active Profile Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.22em] uppercase text-[#A68BC7]">
              <Dna size={12} />
              Taste DNA &amp; Personalization Engine
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#F5F2F7]">
              Your Taste DNA
            </h1>
            <p className="text-sm text-[#AAA5B3] max-w-2xl">
              Live entertainment profile built strictly from your ratings, watchlist,
              feedback, interactions, and MIRA preferences.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#9E97A8] mr-1">
              <UserCheck size={13} className="text-[#D9A45D]" />
              Active User:
            </span>
            {PROFILE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => switchProfile(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  activeUser === p.id
                    ? 'bg-[#9F83C2]/25 border-[#9F83C2] text-[#F5F2F7]'
                    : 'bg-[#17161D] border-white/[0.08] text-[#AAA5B3] hover:text-[#F5F2F7]'
                }`}
              >
                {p.label}
              </button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleResetPersonalization}
              disabled={resetting}
            >
              <RotateCcw size={13} />
              {resetting ? 'Resetting…' : 'Reset Profile'}
            </Button>
          </div>
        </div>

        {notice && (
          <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
            {notice}
          </div>
        )}

        {/* Taste DNA Live Visualization */}
        {tasteDna && (
          <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-[#F5F2F7] inline-flex items-center gap-2">
                  <Sparkles size={17} className="text-[#D9A45D]" />
                  Taste DNA Summary
                </h2>
                <p className="text-sm text-[#CCC7D4]">{tasteDna.preference_summary}</p>
              </div>
              {!tasteDna.has_sufficient_data && (
                <Button variant="primary" size="sm" onClick={handleQuickOnboarding}>
                  Quick Start Taste DNA
                </Button>
              )}
            </div>

            {tasteDna.has_sufficient_data && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Genre Affinity Bars */}
                <div className="lg:col-span-2 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9E97A8]">
                    Genre Affinity Scores (0–100)
                  </h3>
                  {tasteDna.genre_affinity_scores.length === 0 ? (
                    <p className="text-xs text-[#7D7888]">No positive genre affinities recorded yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {tasteDna.genre_affinity_scores.slice(0, 7).map((g) => (
                        <div key={g.genre} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-[#F5F2F7] font-medium">{g.genre}</span>
                            <span className="text-[#D9A45D]">
                              {g.score.toFixed(1)} / 100 · {g.signal_count} signal(s)
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#9F83C2] to-[#D9A45D]"
                              style={{ width: `${Math.max(4, Math.min(100, g.score))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Key Metrics & Patterns */}
                <div className="space-y-4 p-4 rounded-xl bg-[#121116] border border-white/[0.06]">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[#7D7888]">Avg Rating</p>
                      <p className="text-base font-semibold text-[#F5F2F7]">
                        {tasteDna.average_user_rating != null
                          ? `${tasteDna.average_user_rating.toFixed(1)} / 10`
                          : 'No ratings'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#7D7888]">Era Focus</p>
                      <p className="text-sm font-semibold text-[#F5F2F7]">
                        {tasteDna.release_year_preference.label}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#7D7888]">Formats</p>
                      <p className="text-xs font-medium text-[#D8D3DE]">
                        {tasteDna.preferred_content_types.join(', ') || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#7D7888]">Languages</p>
                      <p className="text-xs font-medium text-[#D8D3DE]">
                        {tasteDna.preferred_languages.join(', ') || 'Any'}
                      </p>
                    </div>
                  </div>

                  {tasteDna.favorite_themes.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wider text-[#7D7888]">
                        Favorite Themes
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {tasteDna.favorite_themes.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full text-[11px] bg-[#9F83C2]/15 text-[#E4D9F2]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {tasteDna.discovery_patterns.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-[#7D7888]">
                        Discovery Patterns
                      </p>
                      <ul className="space-y-1 text-xs text-[#AAA5B3] list-disc pl-4">
                        {tasteDna.discovery_patterns.map((pat, i) => (
                          <li key={i}>{pat}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Favorite Directors & Actors */}
            {(tasteDna.favorite_directors.length > 0 || tasteDna.favorite_actors.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
                {tasteDna.favorite_directors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#9E97A8]">
                      Favorite Directors
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {tasteDna.favorite_directors.map((d) => (
                        <span
                          key={d.name}
                          className="px-3 py-1 rounded-lg bg-[#121116] border border-white/[0.08] text-xs text-[#F5F2F7]"
                        >
                          {d.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {tasteDna.favorite_actors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#9E97A8]">
                      Favorite Cast
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {tasteDna.favorite_actors.map((a) => (
                        <span
                          key={a.name}
                          className="px-3 py-1 rounded-lg bg-[#121116] border border-white/[0.08] text-xs text-[#F5F2F7]"
                        >
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Preference Editor */}
        {prefs && (
          <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-[#F5F2F7] inline-flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-[#D9A45D]" />
                Tune Preferences ({activeUser})
              </h2>
              <Button variant="primary" size="sm" onClick={handleSavePreferences} disabled={saving}>
                {saving ? 'Saving…' : 'Save Preferences'}
              </Button>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-[#CCC7D4]">Preferred Genres</p>
              <div className="flex flex-wrap gap-2">
                {GENRE_CHOICES.map((genre) => {
                  const active = prefs.preferred_genres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => togglePreferredGenre(genre)}
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

            <div className="space-y-3">
              <p className="text-xs font-medium text-[#CCC7D4]">Disliked / Avoid Genres</p>
              <div className="flex flex-wrap gap-2">
                {GENRE_CHOICES.map((genre) => {
                  const active = prefs.disliked_genres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => toggleDislikedGenre(genre)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        active
                          ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                          : 'bg-white/[0.03] border-white/[0.08] text-[#AAA5B3] hover:text-[#F5F2F7]'
                      }`}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-[#CCC7D4]">Favorite Themes</p>
              <div className="flex flex-wrap gap-2">
                {THEME_SUGGESTIONS.map((theme) => {
                  const active = (prefs.favorite_themes ?? []).includes(theme);
                  return (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => toggleTheme(theme)}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#CCC7D4]">Preferred Formats</p>
                <div className="flex flex-wrap gap-2">
                  {FORMAT_CHOICES.map((fmt) => {
                    const active = prefs.preferred_types.includes(fmt.value);
                    return (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => toggleFormat(fmt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs border ${
                          active
                            ? 'bg-[#D9A45D]/20 border-[#D9A45D] text-[#F5F2F7]'
                            : 'bg-white/[0.03] border-white/[0.08] text-[#AAA5B3]'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[#CCC7D4] block">
                  Minimum Rating Floor ({(prefs.min_rating ?? 6.5).toFixed(1)}/10)
                </label>
                <input
                  type="range"
                  min="4"
                  max="9"
                  step="0.5"
                  value={prefs.min_rating ?? 6.5}
                  onChange={(e) =>
                    setPrefs({ ...prefs, min_rating: Number(e.target.value) })
                  }
                  className="w-full accent-[#D9A45D]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[#CCC7D4] block">
                  Exploration Openness ({Math.round((prefs.discovery_openness ?? 0.35) * 100)}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={prefs.discovery_openness ?? 0.35}
                  onChange={(e) =>
                    setPrefs({ ...prefs, discovery_openness: Number(e.target.value) })
                  }
                  className="w-full accent-[#9F83C2]"
                />
              </div>
            </div>
          </section>
        )}

        {/* Ratings, Interactions & Feedback */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-4">
            <h2 className="text-base font-semibold text-[#F5F2F7]">
              Saved Ratings ({ratings.length})
            </h2>
            {ratings.length === 0 ? (
              <p className="text-xs text-[#7D7888]">
                Rate titles on any detail page to train your hybrid recommendations.
              </p>
            ) : (
              <div className="space-y-2">
                {ratings.map((r) => (
                  <div
                    key={r.content_id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#121116] border border-white/[0.06]"
                  >
                    <Link
                      href={`/movie/${r.content_id}`}
                      className="text-sm font-medium text-[#F5F2F7] hover:text-[#D9A45D] truncate"
                    >
                      {r.title ?? `Title #${r.content_id}`}
                    </Link>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#D9A45D]">
                        <Star size={12} className="fill-[#D9A45D]" />
                        {r.rating.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveRating(r.content_id)}
                        className="text-[#7D7888] hover:text-rose-400"
                        aria-label="Delete rating"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-4">
            <h2 className="text-base font-semibold text-[#F5F2F7]">
              Interaction History ({interactions.length})
            </h2>
            {interactions.length === 0 ? (
              <p className="text-xs text-[#7D7888]">
                Title views and watch progress appear here automatically.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {interactions.slice(0, 15).map((item, idx) => (
                  <div
                    key={`${item.id ?? idx}`}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#121116] border border-white/[0.06] text-xs"
                  >
                    <span className="text-[#F5F2F7] truncate">
                      {item.title || `Title #${item.content_id ?? '—'}`}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/[0.05] text-[#D9A45D] shrink-0">
                      {item.interaction_type === 'progress'
                        ? `${Math.round(item.progress_pct)}%`
                        : item.interaction_type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-4">
            <h2 className="text-base font-semibold text-[#F5F2F7]">
              Feedback Signals ({feedback.length})
            </h2>
            {feedback.length === 0 ? (
              <p className="text-xs text-[#7D7888]">
                Like, Dislike, Already Watched, More/Less Like This signals appear here.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {feedback.slice(0, 15).map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#121116] border border-white/[0.06] text-xs"
                  >
                    <span className="text-[#F5F2F7] truncate">
                      {f.title || `Title #${f.content_id ?? f.movielens_movie_id}`}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/[0.05] text-[#A68BC7] shrink-0">
                      {f.feedback_type.replaceAll('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* MovieLens ML Evaluation Metrics */}
        {metrics && (
          <section className="p-6 rounded-2xl bg-[#17161D] border border-white/[0.08] space-y-3">
            <h2 className="text-base font-semibold text-[#F5F2F7] inline-flex items-center gap-2">
              <Activity size={15} className="text-[#A68BC7]" />
              Hybrid ML Model Metrics ({metrics.model})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-[#121116] border border-white/[0.06]">
                <p className="text-[#7D7888]">MovieLens Catalog</p>
                <p className="text-base font-semibold text-[#F5F2F7]">
                  {metrics.dataset.movies ?? '—'} films
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#121116] border border-white/[0.06]">
                <p className="text-[#7D7888]">Holdout RMSE</p>
                <p className="text-base font-semibold text-[#F5F2F7]">
                  {metrics.evaluation.rmse ?? '—'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#121116] border border-white/[0.06]">
                <p className="text-[#7D7888]">Precision@10</p>
                <p className="text-base font-semibold text-[#F5F2F7]">
                  {metrics.evaluation.precision_at_10 ?? '—'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#121116] border border-white/[0.06]">
                <p className="text-[#7D7888]">Recall@10</p>
                <p className="text-base font-semibold text-[#F5F2F7]">
                  {metrics.evaluation.recall_at_10 ?? '—'}
                </p>
              </div>
            </div>
          </section>
        )}
        </Container>
      </main>
      <Footer />
    </div>
  );
}
