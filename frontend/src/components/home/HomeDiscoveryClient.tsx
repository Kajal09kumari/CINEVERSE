'use client';

/**
 * HomeDiscoveryClient — orchestrates live Watchmode discovery data for the homepage.
 *
 * Fetches trending, popular, and Watchmode genre labels from FastAPI.
 * Displays skeletons while loading and honest error/retry states if backend
 * or Watchmode credentials are unavailable — never falls back to silent mock data.
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RotateCcw, ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { HeroSkeleton } from '@/components/ui/LoadingState';
import { FeaturedHero } from '@/components/movies/FeaturedHero';
import { MovieCarousel } from '@/components/movies/MovieCarousel';
import { MoodDiscovery } from '@/components/home/MoodDiscovery';
import { HiddenGems } from '@/components/home/HiddenGems';
import { GenreExplorer } from '@/components/home/GenreExplorer';
import { MiraPreview } from '@/components/home/MiraPreview';
import { PersonalisedPreview } from '@/components/home/PersonalisedPreview';
import {
  getMovieGenres,
  getPopularMovies,
  getTrendingMovies,
} from '@/services/movieService';
import type { Movie } from '@/types';

export function HomeDiscoveryClient() {
  const [genreMap, setGenreMap] = useState<Record<number, string>>({});
  const [trending, setTrending] = useState<Movie[]>([]);
  const [popular, setPopular] = useState<Movie[]>([]);

  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const [popularError, setPopularError] = useState<string | null>(null);
  const [trendingTick, setTrendingTick] = useState(0);
  const [popularTick, setPopularTick] = useState(0);

  const retryTrending = useCallback(() => {
    setLoadingTrending(true);
    setTrendingError(null);
    setTrendingTick((n) => n + 1);
  }, []);

  const retryPopular = useCallback(() => {
    setLoadingPopular(true);
    setPopularError(null);
    setPopularTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getTrendingMovies(1), getMovieGenres()])
      .then(([trendingRes, genresRes]) => {
        if (!active) return;

        if (genresRes.status === 'fulfilled') {
          const nextMap: Record<number, string> = {};
          genresRes.value.forEach((g) => {
            nextMap[g.id] = g.name;
          });
          setGenreMap(nextMap);
        }

        if (trendingRes.status === 'fulfilled') {
          setTrending(trendingRes.value.results);
          setTrendingError(null);
        } else {
          const reason = trendingRes.reason;
          setTrendingError(
            reason instanceof Error
              ? reason.message
              : 'Unable to fetch trending movies.'
          );
        }
      })
      .finally(() => {
        if (active) setLoadingTrending(false);
      });

    return () => {
      active = false;
    };
  }, [trendingTick]);

  useEffect(() => {
    let active = true;
    getPopularMovies(1)
      .then((res) => {
        if (!active) return;
        setPopular(res.results);
        setPopularError(null);
      })
      .catch((err) => {
        if (!active) return;
        setPopularError(
          err instanceof Error ? err.message : 'Unable to fetch popular movies.'
        );
      })
      .finally(() => {
        if (active) setLoadingPopular(false);
      });

    return () => {
      active = false;
    };
  }, [popularTick]);

  const heroMovie =
    trending.find((m) => m.backdrop_path) ?? trending[0] ?? null;

  return (
    <main className="flex-1 min-w-0 w-full">
      {/* ── 1. Full-Bleed Cinematic Hero ─────────────────────────────── */}
      {loadingTrending ? (
        <HeroSkeleton />
      ) : heroMovie ? (
        <FeaturedHero
          movie={heroMovie}
          genreMap={genreMap}
          overline="TRENDING SPOTLIGHT"
        />
      ) : (
        <HeroFallbackBanner
          error={trendingError}
          onRetry={() => {
            retryTrending();
            retryPopular();
          }}
        />
      )}

      {/* ── Content Flow (refined vertical rhythm: 56px–72px) ─────────── */}
      <div className="space-y-14 lg:space-y-[72px] pt-10 lg:pt-12">
        <MovieCarousel
          overline="This week on Watchmode"
          title="Trending Now"
          subtitle="What audiences across movies, series, and documentaries are discovering right now."
          movies={trending}
          genreMap={genreMap}
          loading={loadingTrending}
          error={trendingError}
          onRetry={retryTrending}
          viewAllHref="/discover?sort_by=popularity_desc"
          serifTitle
        />

        <MovieCarousel
          overline="Global audience favourites"
          title="Popular Films"
          subtitle="Widely watched cinema across genres and languages."
          movies={popular}
          genreMap={genreMap}
          loading={loadingPopular}
          error={popularError}
          onRetry={retryPopular}
          viewAllHref="/discover?content_type=MOVIE&sort_by=popularity_desc"
          serifTitle
        />

        <MoodDiscovery />

        <HiddenGems genreMap={genreMap} />

        <GenreExplorer />

        <MiraPreview />

        <PersonalisedPreview />
      </div>
    </main>
  );
}

function HeroFallbackBanner({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section
      className="relative w-full min-h-[62vh] flex items-end bg-[#17161D] border-b border-white/[0.08]"
      aria-label="CINEVERSE Hero"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at top right, rgba(128,96,168,0.22), transparent 55%), linear-gradient(to top, #101014 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <Container className="relative pt-28 pb-14">
        <div className="max-w-xl space-y-5">
          <span className="inline-flex items-center gap-2.5 text-xs font-semibold tracking-[0.2em] uppercase text-[#D9A45D]">
            <span className="w-6 h-px bg-[#D9A45D]" aria-hidden="true" />
            DISCOVER BEYOND THE ORDINARY
          </span>
          <h1
            className="text-4xl sm:text-5xl font-bold text-[#F5F2F7] leading-tight"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Cinema Curated Around Your Curiosity.
          </h1>
          <p className="text-sm sm:text-base text-[#AAA5B3] leading-relaxed">
            Explore trending films, TV series, and documentaries powered by
            Watchmode discovery and the CINEVERSE backend.
          </p>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 p-4 rounded-xl bg-[#101014]/90 border border-[#D9A45D]/30"
            >
              <AlertTriangle
                size={16}
                className="text-[#D9A45D] flex-shrink-0 mt-0.5"
              />
              <p className="text-xs sm:text-sm text-[#AAA5B3] leading-relaxed">
                {error}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button href="/discover" variant="primary" size="md">
              Open Discover
              <ArrowRight size={15} />
            </Button>
            {error && (
              <Button onClick={onRetry} variant="secondary" size="md">
                <RotateCcw size={15} />
                Retry Connection
              </Button>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
