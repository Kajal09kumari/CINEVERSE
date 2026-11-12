'use client';

/**
 * MovieDetailClient — dynamic Watchmode content detail + streaming + similar titles view.
 *
 * Fetches full canonical metadata (movies, TV series, documentaries), regional
 * streaming availability, cast/crew, seasons, and similar titles from FastAPI.
 * Automatically bridges legacy TMDB numeric IDs via `/api/content/resolve-legacy/tmdb/{id}`.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Bookmark,
  Check,
  Clock,
  Star,
  Globe,
  ExternalLink,
  AlertCircle,
  RotateCcw,
  Film,
  Tv,
  Users,
  PlayCircle,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/LoadingState';
import { PosterFallback } from './PosterFallback';
import { MovieSection } from './MovieSection';
import { useWatchlist } from '@/hooks/useWatchlist';
import { ApiError } from '@/services/api';
import {
  getMovieDetails,
  getSimilarMovies,
  movieDetailToSummary,
  resolveLegacyTmdbId,
} from '@/services/movieService';
import { contentImageUrl, releaseYear } from '@/lib/utils';
import type { Movie, MovieDetail } from '@/types';

interface MovieDetailClientProps {
  movieId: number;
}

function formatSourceType(raw: string): string {
  switch (raw.toLowerCase()) {
    case 'sub':
      return 'Stream';
    case 'free':
      return 'Free';
    case 'rent':
      return 'Rent';
    case 'buy':
      return 'Buy';
    case 'tve':
      return 'TV Everywhere';
    default:
      return raw || 'Watch';
  }
}

export function MovieDetailClient({ movieId }: MovieDetailClientProps) {
  const router = useRouter();
  const { isInWatchlist, toggleWatchlist, hydrated } = useWatchlist();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [similar, setSimilar] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [posterErr, setPosterErr] = useState(false);
  const [backdropErr, setBackdropErr] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const isInvalidId = !Number.isFinite(movieId) || movieId <= 0;

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setPosterErr(false);
    setBackdropErr(false);
    setRetryTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (isInvalidId) return;
    let active = true;

    async function loadContent() {
      try {
        const detail = await getMovieDetails(movieId);
        if (!active) return;
        setMovie(detail);
        setError(null);
        setNotFound(false);
        setPosterErr(false);
        setBackdropErr(false);

        try {
          const simRes = await getSimilarMovies(detail.id, 1);
          if (active) setSimilar(simRes.results.slice(0, 8));
        } catch {
          if (active) setSimilar([]);
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          // Transparently resolve legacy TMDB bookmarks/links if cached or searchable in Watchmode
          try {
            const bridged = await resolveLegacyTmdbId(movieId, 'movie');
            if (active && bridged?.id && bridged.id !== movieId) {
              router.replace(`/movie/${bridged.id}`);
              return;
            }
          } catch {
            // Fall through to honest not-found UI
          }
          if (active) setNotFound(true);
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load title details.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadContent();

    return () => {
      active = false;
    };
  }, [movieId, isInvalidId, retryTick, router]);

  if (isInvalidId || notFound) {
    return (
      <Container className="pt-28 pb-20">
        <div className="flex flex-col items-center justify-center min-h-[55vh] text-center gap-4 rounded-2xl bg-[#17161D] border border-white/[0.08] p-8">
          <div className="w-14 h-14 rounded-2xl bg-[#1C1A23] border border-white/[0.08] flex items-center justify-center">
            <Film size={24} className="text-[#8060A8]" />
          </div>
          <h1 className="text-2xl font-semibold text-[#F5F2F7]">
            Title Not Found
          </h1>
          <p className="text-sm text-[#AAA5B3] max-w-md">
            We couldn&apos;t locate a Watchmode title matching ID {movieId}.
          </p>
          <Button href="/discover" variant="primary" size="md">
            Browse Discover
          </Button>
        </div>
      </Container>
    );
  }

  if (loading) {
    return (
      <div className="pt-28 pb-16">
        <Container>
          <Skeleton className="h-72 w-full rounded-2xl mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <Skeleton className="md:col-span-4 lg:col-span-3 aspect-[2/3] max-w-[260px] rounded-2xl" />
            <div className="md:col-span-8 lg:col-span-9 space-y-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-24 w-full max-w-2xl" />
            </div>
          </div>
        </Container>
      </div>
    );
  }

  if (error || !movie) {
    return (
      <Container className="pt-28 pb-20">
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-[55vh] text-center gap-4 rounded-2xl bg-[#17161D] border border-white/[0.08] p-8"
        >
          <AlertCircle size={28} className="text-[#D9A45D]" />
          <h1 className="text-2xl font-semibold text-[#F5F2F7]">
            Unable to Load Title Details
          </h1>
          <p className="text-sm text-[#AAA5B3] max-w-md">
            {error ?? 'Watchmode backend request failed.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleRetry} variant="primary" size="md">
              <RotateCcw size={15} />
              Retry
            </Button>
            <Button href="/discover" variant="secondary" size="md">
              Browse Discover
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  const saved = hydrated && isInWatchlist(movie.id);
  const year = releaseYear(movie.release_date);
  const runtime = movie.runtime ?? 0;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;

  const backdropSrc = !backdropErr
    ? contentImageUrl(movie.backdrop_path ?? movie.poster_path)
    : null;
  const posterSrc = !posterErr ? contentImageUrl(movie.poster_path) : null;
  const summaryForWatchlist = movieDetailToSummary(movie);

  const typeLabel =
    movie.content_type === 'DOCUMENTARY' || movie.is_documentary
      ? 'Documentary'
      : movie.content_type === 'TV_SERIES'
        ? 'TV Series'
        : 'Feature Film';

  const dedupedSources = movie.streaming_sources.filter(
    (src, idx, arr) =>
      arr.findIndex((s) => s.source_id === src.source_id && s.type === src.type) === idx
  );

  return (
    <div className="relative">
      {/* Backdrop */}
      <div className="relative h-[44vh] min-h-[300px] w-full overflow-hidden bg-[#17161D]">
        {backdropSrc && (
          <Image
            src={backdropSrc}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ filter: 'brightness(0.55)' }}
            onError={() => setBackdropErr(true)}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, #101014 0%, rgba(16,16,20,0.5) 60%, rgba(16,16,20,0.65) 100%)',
          }}
        />
      </div>

      {/* Main content */}
      <Container className="relative -mt-36 pb-14">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs text-[#AAA5B3] hover:text-[#F5F2F7] mb-6 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Home
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Poster */}
          <div className="md:col-span-4 lg:col-span-3">
            <div
              className="relative rounded-2xl overflow-hidden bg-[#1C1A23] border border-white/[0.1] shadow-2xl max-w-[260px]"
              style={{ aspectRatio: '2 / 3' }}
            >
              {posterSrc ? (
                <Image
                  src={posterSrc}
                  alt={`${movie.title} poster`}
                  fill
                  sizes="260px"
                  className="object-cover"
                  onError={() => setPosterErr(true)}
                />
              ) : (
                <PosterFallback
                  title={movie.title}
                  year={year ? Number(year) : null}
                  genre={movie.genres[0]?.name}
                />
              )}
            </div>
          </div>

          {/* Info */}
          <div className="md:col-span-8 lg:col-span-9 space-y-5 pt-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs tracking-[0.18em] uppercase text-[#A68BC7]">
                {movie.content_type === 'TV_SERIES' ? <Tv size={13} /> : <Film size={13} />}
                {typeLabel}
              </span>
              {movie.tagline && (
                <span className="text-xs text-[#77727F]">· {movie.tagline}</span>
              )}
            </div>

            <h1
              className="text-3xl sm:text-5xl font-bold text-[#F5F2F7] leading-tight"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              {movie.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-[#AAA5B3]">
              {movie.vote_average > 0 && (
                <span
                  className="flex items-center gap-1.5 text-[#D9A45D] font-medium"
                  title={movie.rating_source ? `${movie.rating_source} rating` : 'Public rating'}
                >
                  <Star size={15} fill="#D9A45D" strokeWidth={0} />
                  {movie.vote_average.toFixed(1)}
                </span>
              )}
              {year && <span>{year}</span>}
              {runtime > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {hours > 0 ? `${hours}h ` : ''}
                  {mins}m
                </span>
              )}
              {movie.original_language && (
                <span className="inline-flex items-center gap-1 uppercase text-xs px-2 py-0.5 rounded bg-white/[0.05]">
                  <Globe size={12} />
                  {movie.original_language}
                </span>
              )}
              {movie.genres.map((g) => (
                <Link
                  key={g.id}
                  href={`/discover?genre=${g.id}`}
                  className="px-2.5 py-0.5 rounded-full text-xs text-[#A68BC7] bg-[#8060A8]/15 border border-[#8060A8]/30 hover:bg-[#8060A8]/25 transition-colors"
                >
                  {g.name}
                </Link>
              ))}
            </div>

            <p className="text-base text-[#AAA5B3] leading-relaxed max-w-2xl">
              {movie.overview || 'No synopsis is currently available for this title.'}
            </p>

            {/* Directors */}
            {movie.directors.length > 0 && (
              <p className="text-xs sm:text-sm text-[#AAA5B3]">
                <span className="text-[#77727F]">Directed by </span>
                <span className="text-[#F5F2F7] font-medium">
                  {movie.directors.join(', ')}
                </span>
              </p>
            )}

            {/* Primary Actions */}
            <div className="pt-2 flex flex-wrap gap-3">
              <Button
                onClick={() => toggleWatchlist(summaryForWatchlist)}
                variant={saved ? 'amber' : 'primary'}
                size="lg"
              >
                {saved ? <Check size={16} /> : <Bookmark size={16} />}
                {saved ? 'In Watchlist' : 'Add to Watchlist'}
              </Button>
              <Button href="/discover" variant="secondary" size="lg">
                Browse More Titles
              </Button>
              {movie.trailer_url && (
                <a
                  href={movie.trailer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-[#AAA5B3] hover:text-[#F5F2F7] border border-white/[0.1] hover:border-white/[0.2] transition-colors"
                >
                  <PlayCircle size={15} />
                  Watch Trailer
                  <ExternalLink size={13} />
                </a>
              )}
            </div>

            {/* Where to Watch (Watchmode Regional Streaming Sources) */}
            {dedupedSources.length > 0 && (
              <div className="pt-4 space-y-2.5">
                <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-[#77727F]">
                  Where to Watch
                </h2>
                <div className="flex flex-wrap gap-2.5">
                  {dedupedSources.slice(0, 10).map((source) => {
                    const currencySymbol =
                      source.region === 'IN'
                        ? '₹'
                        : source.region === 'GB'
                          ? '£'
                          : source.region === 'EU' || source.region === 'DE' || source.region === 'FR'
                            ? '€'
                            : '$';
                    const priceText =
                      source.price != null && source.price > 0
                        ? ` (${currencySymbol}${Number.isInteger(source.price) ? source.price : source.price.toFixed(2)})`
                        : '';
                    const label = `${source.name} · ${formatSourceType(source.type)}${priceText}`;
                    const content = (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#17161D] hover:bg-[#1C1A23] border border-white/[0.1] text-xs font-medium text-[#F5F2F7] transition-colors">
                        <span>{label}</span>
                        {source.web_url && <ExternalLink size={11} className="text-[#A68BC7]" />}
                      </span>
                    );
                    return source.web_url ? (
                      <a
                        key={`${source.source_id}-${source.type}`}
                        href={source.web_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {content}
                      </a>
                    ) : (
                      <span key={`${source.source_id}-${source.type}`}>{content}</span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cast Strip */}
            {movie.cast.length > 0 && (
              <div className="pt-4 space-y-2.5">
                <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.16em] uppercase text-[#77727F]">
                  <Users size={13} />
                  Top Cast
                </h2>
                <div className="flex flex-wrap gap-2">
                  {movie.cast.slice(0, 8).map((person, idx) => (
                    <span
                      key={person.person_id ?? `${person.full_name}-${idx}`}
                      className="px-3 py-1.5 rounded-xl bg-[#17161D] border border-white/[0.08] text-xs text-[#AAA5B3]"
                    >
                      <span className="text-[#F5F2F7] font-medium">{person.full_name}</span>
                      {person.role ? ` as ${person.role}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* TV Series Seasons */}
            {movie.seasons.length > 0 && (
              <div className="pt-4 space-y-2.5">
                <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.16em] uppercase text-[#77727F]">
                  <Tv size={13} />
                  Seasons ({movie.seasons.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl">
                  {movie.seasons.slice(0, 6).map((season) => (
                    <div
                      key={season.id}
                      className="p-3.5 rounded-xl bg-[#17161D] border border-white/[0.08] space-y-1"
                    >
                      <p className="text-sm font-medium text-[#F5F2F7]">
                        {season.name || `Season ${season.number ?? ''}`}
                      </p>
                      <p className="text-xs text-[#77727F]">
                        {[
                          season.episode_count ? `${season.episode_count} episodes` : null,
                          season.air_date ? releaseYear(season.air_date) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Season details available'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="pt-2 text-[11px] text-[#77727F]">
              {movie.attribution}
            </p>
          </div>
        </div>
      </Container>

      {/* Metadata-based Similar Titles */}
      {similar.length > 0 && (
        <div className="pt-6 pb-16 border-t border-white/[0.06]">
          <MovieSection
            id="similar-movies"
            overline="Watchmode Metadata Match"
            title="Similar Titles"
            subtitle="Metadata-based similar titles from Watchmode (personalised ML ranking arrives in the next milestone)."
            movies={similar}
            serifTitle
          />
        </div>
      )}
    </div>
  );
}
