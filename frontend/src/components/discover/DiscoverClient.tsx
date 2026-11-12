'use client';

/**
 * DiscoverClient — Watchmode-powered interactive multi-format discovery page.
 *
 * Supports:
 * - Debounced title search + Enter submission
 * - Content Type tabs/filter (All, Movies, TV Series, Documentaries)
 * - Watchmode genre filtering + mood link translation
 * - Language, release year, minimum rating (6+, 7+, 8+), and sort order selectors
 * - Active filter chips & Clear All
 * - Paginated results grid with loading skeletons, empty state, and error/retry UI
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  SlidersHorizontal,
  X,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { MovieCard } from '@/components/movies/MovieCard';
import { MovieCardSkeleton } from '@/components/ui/LoadingState';
import {
  discoverMovies,
  getMovieGenres,
  MOOD_TO_DISCOVER,
  searchMovies,
  WATCHMODE_GENRE_FALLBACK_MAP,
} from '@/services/movieService';
import type { ContentFilterType, Genre, Movie, SortOption } from '@/types';

const CONTENT_TYPE_OPTIONS: Array<{ value: ContentFilterType; label: string }> = [
  { value: 'ALL', label: 'All Titles' },
  { value: 'MOVIE', label: 'Movies' },
  { value: 'TV_SERIES', label: 'TV Series' },
  { value: 'DOCUMENTARY', label: 'Documentaries' },
];

const LANGUAGE_OPTIONS = [
  { code: '', label: 'All Languages' },
  { code: 'en', label: 'English (EN)' },
  { code: 'hi', label: 'Hindi (HI)' },
  { code: 'ko', label: 'Korean (KO)' },
  { code: 'ja', label: 'Japanese (JA)' },
  { code: 'fr', label: 'French (FR)' },
  { code: 'es', label: 'Spanish (ES)' },
] as const;

const RATING_OPTIONS = [
  { value: '', label: 'Any Rating' },
  { value: '6', label: '6.0+ Good' },
  { value: '7', label: '7.0+ Great' },
  { value: '8', label: '8.0+ Acclaimed' },
] as const;

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'popularity_desc', label: 'Most Popular' },
  { value: 'rating_desc', label: 'Highest Rated' },
  { value: 'release_date_desc', label: 'Newest Releases' },
  { value: 'title_asc', label: 'Title (A–Z)' },
];

const YEAR_OPTIONS = [
  '',
  '2026',
  '2025',
  '2024',
  '2023',
  '2022',
  '2021',
  '2020',
  '2019',
  '2018',
  '2015',
  '2014',
  '2010',
  '2000',
] as const;

const FALLBACK_GENRES: Genre[] = Object.entries(WATCHMODE_GENRE_FALLBACK_MAP).map(
  ([id, name]) => ({ id: Number(id), name })
);

function parseContentType(raw: string | null): ContentFilterType {
  const upper = (raw ?? '').toUpperCase();
  if (upper === 'MOVIE' || upper === 'TV_SERIES' || upper === 'DOCUMENTARY') {
    return upper;
  }
  return 'ALL';
}

function parseSortOption(raw: string | null): SortOption {
  const legacyMap: Record<string, SortOption> = {
    'popularity.desc': 'popularity_desc',
    'vote_average.desc': 'rating_desc',
    'primary_release_date.desc': 'release_date_desc',
    'title.asc': 'title_asc',
  };
  if (raw && legacyMap[raw]) return legacyMap[raw];
  const valid: SortOption[] = [
    'popularity_desc',
    'rating_desc',
    'release_date_desc',
    'title_asc',
  ];
  return raw && valid.includes(raw as SortOption)
    ? (raw as SortOption)
    : 'popularity_desc';
}

export function DiscoverClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get('q') ?? '';
  const urlContentType = parseContentType(searchParams.get('content_type'));
  const urlGenreParam = searchParams.get('genre') ?? '';
  const urlMoodParam = searchParams.get('mood') ?? '';
  const urlLanguage = searchParams.get('language') ?? '';
  const urlYear = searchParams.get('year') ?? '';
  const urlMinRating = searchParams.get('min_rating') ?? '';
  const urlSortBy = parseSortOption(searchParams.get('sort_by'));
  const urlPage = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [genres, setGenres] = useState<Genre[]>(FALLBACK_GENRES);
  const [draftQuery, setDraftQuery] = useState<string | null>(null);
  const inputValue = draftQuery ?? urlQuery;

  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  // Fetch live Watchmode genre list
  useEffect(() => {
    let active = true;
    getMovieGenres()
      .then((list) => {
        if (active && list.length > 0) setGenres(list);
      })
      .catch(() => {
        // Keep Watchmode fallback genre map silently if genres endpoint is unreachable
      });
    return () => {
      active = false;
    };
  }, []);

  const genreMap = useMemo(() => {
    const map: Record<number, string> = { ...WATCHMODE_GENRE_FALLBACK_MAP };
    genres.forEach((g) => {
      map[g.id] = g.name;
    });
    return map;
  }, [genres]);

  // Resolve URL genre param (accepts numeric ID(s) or human-readable genre name like "Science Fiction")
  const resolvedGenreIds = useMemo(() => {
    if (urlGenreParam) {
      if (/^[0-9,|]+$/.test(urlGenreParam)) return urlGenreParam;
      const found = genres.find(
        (g) => g.name.toLowerCase() === urlGenreParam.toLowerCase()
      );
      if (found) return String(found.id);
    }
    if (urlMoodParam) {
      const moodConfig = MOOD_TO_DISCOVER[urlMoodParam.toLowerCase()];
      if (moodConfig) return moodConfig.genreIds;
    }
    return '';
  }, [urlGenreParam, urlMoodParam, genres]);

  const effectiveMinRating = useMemo(() => {
    if (urlMinRating) return urlMinRating;
    if (urlMoodParam && !urlGenreParam) {
      const moodConfig = MOOD_TO_DISCOVER[urlMoodParam.toLowerCase()];
      if (moodConfig?.minRating) return String(moodConfig.minRating);
    }
    return '';
  }, [urlMinRating, urlMoodParam, urlGenreParam]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (!value || (key === 'content_type' && value === 'ALL')) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });
      if (resetPage && !('page' in updates)) {
        next.delete('page');
      }
      setLoading(true);
      setError(null);
      const qs = next.toString();
      router.replace(qs ? `/discover?${qs}` : '/discover', { scroll: false });
    },
    [router, searchParams]
  );

  // Debounce text input into URL query param inside async timer callback
  useEffect(() => {
    if (draftQuery === null) return;
    const trimmed = draftQuery.trim();
    if (trimmed === urlQuery.trim()) return;
    const timer = window.setTimeout(() => {
      setDraftQuery(null);
      updateParams({ q: trimmed || null });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftQuery, urlQuery, updateParams]);

  useEffect(() => {
    let active = true;
    const activeQuery = urlQuery.trim();

    const requestPromise = activeQuery
      ? searchMovies(activeQuery, urlPage, urlContentType).then((res) => {
          let list = res.results;
          if (resolvedGenreIds) {
            const wanted = resolvedGenreIds.split(/[|,]/).map(Number);
            list = list.filter((m) =>
              m.genre_ids.some((id) => wanted.includes(id))
            );
          }
          if (urlLanguage) {
            list = list.filter(
              (m) =>
                !m.original_language ||
                m.original_language.toLowerCase() === urlLanguage.toLowerCase()
            );
          }
          if (urlYear) {
            list = list.filter((m) => m.release_date.startsWith(urlYear));
          }
          if (effectiveMinRating) {
            const minR = Number(effectiveMinRating);
            list = list.filter((m) => m.vote_average >= minR);
          }
          return {
            results: list,
            total_pages: Math.max(1, res.total_pages),
            total_results:
              list.length === res.results.length ? res.total_results : list.length,
          };
        })
      : discoverMovies({
          content_type: urlContentType,
          genre: resolvedGenreIds || undefined,
          language: urlLanguage || undefined,
          year: urlYear ? Number(urlYear) : undefined,
          min_rating: effectiveMinRating ? Number(effectiveMinRating) : undefined,
          sort_by: urlSortBy,
          page: urlPage,
        });

    requestPromise
      .then((res) => {
        if (!active) return;
        setMovies(res.results);
        setTotalPages(Math.max(1, res.total_pages));
        setTotalResults(res.total_results);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setMovies([]);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load titles from Watchmode.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    urlQuery,
    urlContentType,
    resolvedGenreIds,
    urlLanguage,
    urlYear,
    effectiveMinRating,
    urlSortBy,
    urlPage,
    retryTick,
  ]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRetryTick((n) => n + 1);
  }, []);

  const hasAnyFilter = Boolean(
    urlQuery.trim() ||
      urlContentType !== 'ALL' ||
      urlGenreParam ||
      urlMoodParam ||
      urlLanguage ||
      urlYear ||
      urlMinRating ||
      urlSortBy !== 'popularity_desc'
  );

  function clearAllFilters() {
    setDraftQuery(null);
    setLoading(true);
    setError(null);
    router.replace('/discover', { scroll: false });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    setDraftQuery(null);
    updateParams({ q: trimmed || null });
  }

  const activeChips: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (urlQuery.trim()) {
    activeChips.push({
      key: 'q',
      label: `Search: "${urlQuery.trim()}"`,
      onClear: () => {
        setDraftQuery(null);
        updateParams({ q: null });
      },
    });
  }
  if (urlContentType !== 'ALL') {
    const typeLabel =
      CONTENT_TYPE_OPTIONS.find((t) => t.value === urlContentType)?.label ?? urlContentType;
    activeChips.push({
      key: 'content_type',
      label: `Format: ${typeLabel}`,
      onClear: () => updateParams({ content_type: null }),
    });
  }
  if (urlMoodParam && MOOD_TO_DISCOVER[urlMoodParam.toLowerCase()]) {
    activeChips.push({
      key: 'mood',
      label: `Mood: ${MOOD_TO_DISCOVER[urlMoodParam.toLowerCase()].label}`,
      onClear: () => updateParams({ mood: null }),
    });
  }
  if (urlGenreParam) {
    const label = resolvedGenreIds
      .split(/[|,]/)
      .map((id) => genreMap[Number(id)] ?? urlGenreParam)
      .join(', ');
    activeChips.push({
      key: 'genre',
      label: `Genre: ${label}`,
      onClear: () => updateParams({ genre: null }),
    });
  }
  if (urlLanguage) {
    const langLabel =
      LANGUAGE_OPTIONS.find((l) => l.code === urlLanguage)?.label ??
      urlLanguage.toUpperCase();
    activeChips.push({
      key: 'language',
      label: `Language: ${langLabel}`,
      onClear: () => updateParams({ language: null }),
    });
  }
  if (urlYear) {
    activeChips.push({
      key: 'year',
      label: `Year: ${urlYear}`,
      onClear: () => updateParams({ year: null }),
    });
  }
  if (effectiveMinRating) {
    activeChips.push({
      key: 'min_rating',
      label: `Rating: ${effectiveMinRating}+`,
      onClear: () => updateParams({ min_rating: null, mood: null }),
    });
  }

  return (
    <Container className="pt-28 pb-20">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs text-[#AAA5B3] hover:text-[#F5F2F7] mb-6 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Home
      </Link>

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-medium tracking-[0.2em] uppercase text-[#A68BC7] block mb-2">
            Watchmode Smart Catalogue
          </span>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#F5F2F7] leading-tight"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Discover Your Next Favourite.
          </h1>
          <p className="text-sm text-[#AAA5B3] mt-2 max-w-2xl">
            Search live movies, TV series, and documentaries or combine genre,
            language, release year, and rating filters.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#17161D] hover:bg-[#1C1A23] border border-white/[0.08] text-xs font-medium text-[#F5F2F7] w-fit transition-colors"
        >
          <SlidersHorizontal size={14} className="text-[#A68BC7]" />
          {filtersOpen ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>

      {/* ── Content Type Selector Pills ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-5" role="group" aria-label="Filter by content type">
        {CONTENT_TYPE_OPTIONS.map((opt) => {
          const isActive = urlContentType === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                updateParams({ content_type: opt.value === 'ALL' ? null : opt.value })
              }
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-[#8060A8] text-white border-[#8060A8]'
                  : 'bg-[#17161D] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7] hover:border-white/[0.16]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ── Search + Filter Bar ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-[#17161D] border border-white/[0.08] p-5 sm:p-6 mb-8 space-y-5">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#77727F]"
            />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="Search movies, series, or documentaries (e.g. Interstellar, Severance, Free Solo)..."
              aria-label="Search titles"
              className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#101014] border border-white/[0.1] text-sm text-[#F5F2F7] placeholder:text-[#77727F] focus:outline-none focus:border-[#8060A8]"
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => {
                  setDraftQuery(null);
                  updateParams({ q: null });
                }}
                aria-label="Clear search query"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#77727F] hover:text-[#F5F2F7] p-1"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="h-11 px-6 rounded-xl bg-[#8060A8] hover:bg-[#9372BC] text-sm font-medium text-[#F5F2F7] transition-colors flex-shrink-0"
          >
            Search
          </button>
        </form>

        {filtersOpen && (
          <div className="space-y-5 pt-4 border-t border-white/[0.06]">
            {/* Dropdowns row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Language */}
              <label className="flex flex-col gap-1.5 text-xs text-[#AAA5B3]">
                <span className="font-medium text-[#F5F2F7]">Language</span>
                <select
                  value={urlLanguage}
                  onChange={(e) =>
                    updateParams({ language: e.target.value || null })
                  }
                  className="h-10 px-3 rounded-xl bg-[#101014] border border-white/[0.1] text-sm text-[#F5F2F7] focus:outline-none focus:border-[#8060A8]"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Release Year */}
              <label className="flex flex-col gap-1.5 text-xs text-[#AAA5B3]">
                <span className="font-medium text-[#F5F2F7]">Release Year</span>
                <select
                  value={urlYear}
                  onChange={(e) =>
                    updateParams({ year: e.target.value || null })
                  }
                  className="h-10 px-3 rounded-xl bg-[#101014] border border-white/[0.1] text-sm text-[#F5F2F7] focus:outline-none focus:border-[#8060A8]"
                >
                  <option value="">All Years</option>
                  {YEAR_OPTIONS.filter(Boolean).map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </label>

              {/* Minimum Rating */}
              <label className="flex flex-col gap-1.5 text-xs text-[#AAA5B3]">
                <span className="font-medium text-[#F5F2F7]">Minimum Rating</span>
                <select
                  value={effectiveMinRating}
                  onChange={(e) =>
                    updateParams({
                      min_rating: e.target.value || null,
                      mood: null,
                    })
                  }
                  className="h-10 px-3 rounded-xl bg-[#101014] border border-white/[0.1] text-sm text-[#F5F2F7] focus:outline-none focus:border-[#8060A8]"
                >
                  {RATING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Sort By */}
              <label className="flex flex-col gap-1.5 text-xs text-[#AAA5B3]">
                <span className="font-medium text-[#F5F2F7]">Sort By</span>
                <select
                  value={urlSortBy}
                  onChange={(e) =>
                    updateParams({ sort_by: e.target.value || null })
                  }
                  disabled={Boolean(urlQuery.trim())}
                  className="h-10 px-3 rounded-xl bg-[#101014] border border-white/[0.1] text-sm text-[#F5F2F7] focus:outline-none focus:border-[#8060A8] disabled:opacity-50"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Genre Pills */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#F5F2F7]">Genres</span>
                {hasAnyFilter && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-xs font-medium text-[#A68BC7] hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateParams({ genre: null, mood: null })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    !resolvedGenreIds
                      ? 'bg-[#8060A8] text-white border-[#8060A8]'
                      : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                  }`}
                >
                  All Genres
                </button>
                {genres.slice(0, 20).map((g) => {
                  const selectedList = resolvedGenreIds
                    ? resolvedGenreIds.split(/[|,]/).map(Number)
                    : [];
                  const isActive = selectedList.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        updateParams({
                          genre: isActive ? null : String(g.id),
                          mood: null,
                        });
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        isActive
                          ? 'bg-[#8060A8]/30 text-[#F5F2F7] border-[#A68BC7]'
                          : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7] hover:border-white/[0.16]'
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Active Filter Chips & Result Meta ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-[#8060A8]/20 border border-[#8060A8]/40 text-[#F5F2F7] hover:bg-[#8060A8]/30 transition-colors"
            >
              <span>{chip.label}</span>
              <X size={12} />
            </button>
          ))}
        </div>

        {!loading && !error && (
          <p className="text-xs text-[#77727F]">
            Page {urlPage} of {totalPages} · {totalResults.toLocaleString()} matches
          </p>
        )}
      </div>

      {/* ── Results Grid ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {Array.from({ length: 10 }).map((_, idx) => (
            <MovieCardSkeleton key={idx} />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4 rounded-2xl bg-[#17161D] border border-white/[0.08]"
        >
          <AlertCircle size={28} className="text-[#D9A45D]" />
          <h2 className="text-lg font-semibold text-[#F5F2F7]">
            Unable to load Watchmode titles
          </h2>
          <p className="text-sm text-[#AAA5B3] max-w-md">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8060A8] hover:bg-[#9372BC] text-xs font-medium text-white transition-colors"
          >
            <RotateCcw size={14} />
            Retry
          </button>
        </div>
      ) : movies.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {movies.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                genreMap={genreMap}
                className="w-full"
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-12">
              <button
                type="button"
                disabled={urlPage <= 1}
                onClick={() =>
                  updateParams({ page: String(urlPage - 1) }, false)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#17161D] hover:bg-[#1C1A23] border border-white/[0.08] text-xs font-medium text-[#F5F2F7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span className="text-xs text-[#AAA5B3] px-2">
                Page {urlPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={urlPage >= totalPages}
                onClick={() =>
                  updateParams({ page: String(urlPage + 1) }, false)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#17161D] hover:bg-[#1C1A23] border border-white/[0.08] text-xs font-medium text-[#F5F2F7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3 rounded-2xl bg-[#17161D] border border-white/[0.08]">
          <Compass size={28} className="text-[#8060A8]" />
          <h2 className="text-lg font-semibold text-[#F5F2F7]">
            No matching titles found
          </h2>
          <p className="text-sm text-[#AAA5B3] max-w-md px-4">
            Try loosening your format, genre, year, or rating filters, or search
            with a broader title keyword.
          </p>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="mt-2 text-xs font-medium text-[#A68BC7] hover:underline"
            >
              Reset all filters
            </button>
          )}
        </div>
      )}
    </Container>
  );
}
