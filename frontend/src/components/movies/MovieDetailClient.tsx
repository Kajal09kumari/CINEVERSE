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
  FolderPlus,
  ThumbsUp,
  ThumbsDown,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles,
  MinusCircle,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/LoadingState';
import { PosterFallback } from './PosterFallback';
import { MovieSection } from './MovieSection';
import { useWatchlist } from '@/hooks/useWatchlist';
import { ApiError } from '@/services/api';
import {
  getContentEpisodes,
  getMovieDetails,
  getSimilarMovies,
  movieDetailToSummary,
  resolveLegacyTmdbId,
} from '@/services/movieService';
import {
  addToCollection,
  fetchCollections,
  fetchUserRatings,
  saveUserRating,
} from '@/services/libraryService';
import {
  getSimilarRecommendations,
  recordInteraction,
  submitRecommendationFeedback,
} from '@/services/miraService';
import { getActiveUserId } from '@/lib/userContext';
import { contentImageUrl, releaseYear } from '@/lib/utils';
import type {
  Collection,
  EpisodeInfo,
  FeedbackType,
  Movie,
  MovieDetail,
  RecommendedTitleCard,
} from '@/types';

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
  const [mlSimilar, setMlSimilar] = useState<RecommendedTitleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [posterErr, setPosterErr] = useState(false);
  const [backdropErr, setBackdropErr] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // User library & taste signals
  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingSavedNote, setRatingSavedNote] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const [collectionMessage, setCollectionMessage] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null);
  const [activeFeedback, setActiveFeedback] = useState<FeedbackType | null>(null);

  // TV Series interactive episode drawer
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, EpisodeInfo[]>>({});
  const [loadingSeason, setLoadingSeason] = useState<number | null>(null);

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

        const uid = getActiveUserId();
        void recordInteraction({
          user_id: uid,
          content_id: detail.id,
          title: detail.title,
          content_type: detail.content_type,
          genres: detail.genres.map((g) => g.name),
          interaction_type: 'viewed',
        }).catch(() => {});

        void import('@/services/analyticsService').then(({ trackEvent }) => {
          trackEvent({
            event_type: 'content_viewed',
            user_id: uid,
            content_id: detail.id,
            title: detail.title,
            source_surface: 'movie_detail',
            dedupe_key: `view:${detail.id}`,
            metadata: {
              content_type: detail.content_type ?? 'MOVIE',
              genres: detail.genres.map((g) => g.name),
            },
          });
          trackEvent({
            event_type: 'streaming_availability_checked',
            user_id: uid,
            content_id: detail.id,
            title: detail.title,
            source_surface: 'movie_detail',
            dedupe_key: `stream:${detail.id}`,
            metadata: {
              source_count: detail.streaming_sources?.length ?? 0,
            },
          });
        });

        const [simResult, mlResult, ratingsResult, colsResult] = await Promise.allSettled([
          getSimilarMovies(detail.id, 1),
          getSimilarRecommendations(detail.id, { userId: uid, topK: 6 }),
          fetchUserRatings(uid),
          fetchCollections(uid),
        ]);
        if (!active) return;

        if (simResult.status === 'fulfilled') {
          setSimilar(simResult.value.results.slice(0, 8));
        } else {
          setSimilar([]);
        }
        if (mlResult.status === 'fulfilled') {
          setMlSimilar(mlResult.value.results);
        } else {
          setMlSimilar([]);
        }
        if (ratingsResult.status === 'fulfilled') {
          const found = ratingsResult.value.find((r) => r.content_id === detail.id);
          setUserRating(found ? found.rating : null);
        }
        if (colsResult.status === 'fulfilled') {
          setCollections(colsResult.value);
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

  const handleRate = async (score: number) => {
    setUserRating(score);
    setRatingSavedNote(`Saved your ${score}/10 rating`);
    try {
      await saveUserRating(movie.id, score, getActiveUserId());
    } catch {
      setRatingSavedNote('Could not sync rating right now.');
    }
  };

  const handleFeedback = async (type: FeedbackType) => {
    setActiveFeedback(type);
    try {
      const res = await submitRecommendationFeedback({
        user_id: getActiveUserId(),
        feedback_type: type,
        content_id: movie.id,
        title: movie.title,
      });
      setFeedbackNote(res.profile_note);
    } catch {
      setFeedbackNote('Recorded feedback locally.');
    }
  };

  const handleProgress = async (pct: number) => {
    try {
      await recordInteraction({
        user_id: getActiveUserId(),
        content_id: movie.id,
        title: movie.title,
        content_type: movie.content_type,
        genres: movie.genres.map((g) => g.name),
        interaction_type: 'progress',
        progress_pct: pct,
      });
      setFeedbackNote(
        pct >= 95
          ? 'Marked completed! Removed from Continue Exploring.'
          : `Saved ${pct}% watch progress for Continue Exploring.`
      );
    } catch {
      setFeedbackNote('Could not save watch progress.');
    }
  };

  const handleAddCollection = async (collectionId: number, collectionName: string) => {
    try {
      await addToCollection(collectionId, movie.id, getActiveUserId());
      setCollectionMessage(`Added to "${collectionName}"`);
      setCollectionMenuOpen(false);
    } catch {
      setCollectionMessage('Failed to add to collection.');
    }
  };

  const handleToggleSeason = async (seasonNumber: number | null) => {
    const sNum = seasonNumber ?? 1;
    if (expandedSeason === sNum) {
      setExpandedSeason(null);
      return;
    }
    setExpandedSeason(sNum);
    if (episodesBySeason[sNum]) return;
    setLoadingSeason(sNum);
    try {
      const eps = await getContentEpisodes(movie.id, sNum);
      setEpisodesBySeason((prev) => ({ ...prev, [sNum]: eps }));
    } catch {
      setEpisodesBySeason((prev) => ({ ...prev, [sNum]: [] }));
    } finally {
      setLoadingSeason(null);
    }
  };

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
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => toggleWatchlist(summaryForWatchlist)}
                variant={saved ? 'amber' : 'primary'}
                size="lg"
              >
                {saved ? <Check size={16} /> : <Bookmark size={16} />}
                {saved ? 'In Watchlist' : 'Add to Watchlist'}
              </Button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCollectionMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-[#17161D] hover:bg-[#1C1A23] text-[#F5F2F7] border border-white/[0.1] transition-colors"
                >
                  <FolderPlus size={15} className="text-[#A68BC7]" />
                  Save to Collection
                </button>
                {collectionMenuOpen && (
                  <div className="absolute left-0 mt-2 w-60 rounded-xl bg-[#17161D] border border-white/[0.12] shadow-xl p-2 z-30 space-y-1">
                    {collections.length === 0 ? (
                      <Link
                        href="/collections"
                        className="block px-3 py-2 rounded-lg text-xs text-[#A68BC7] hover:bg-white/[0.04]"
                      >
                        No collections yet — create one
                      </Link>
                    ) : (
                      collections.map((col) => (
                        <button
                          key={col.id}
                          type="button"
                          onClick={() => handleAddCollection(col.id, col.name)}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#F5F2F7] hover:bg-white/[0.06] flex items-center justify-between"
                        >
                          <span className="truncate">{col.name}</span>
                          <span className="text-[#77727F]">{col.item_count}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

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

            {collectionMessage && (
              <p className="text-xs text-[#A68BC7]">{collectionMessage}</p>
            )}

            {/* User Rating & Taste Feedback */}
            <div className="p-4 rounded-2xl bg-[#17161D]/90 border border-white/[0.08] space-y-3 max-w-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-[0.12em] uppercase text-[#AAA5B3]">
                  Your Rating {userRating ? `· ${userRating}/10` : ''}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {[2, 4, 6, 7, 8, 9, 10].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => handleRate(score)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        userRating === score
                          ? 'bg-[#D9A45D] text-[#101014] border-[#D9A45D]'
                          : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
              {ratingSavedNote && (
                <p className="text-[11px] text-[#D9A45D]">{ratingSavedNote}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/[0.06]">
                <span className="text-xs text-[#77727F] mr-1">MIRA signal:</span>
                <button
                  type="button"
                  onClick={() => handleFeedback('like')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    activeFeedback === 'like'
                      ? 'bg-[#8060A8]/30 text-[#F5F2F7] border-[#A68BC7]'
                      : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                  }`}
                >
                  <ThumbsUp size={12} />
                  Like
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback('dislike')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    activeFeedback === 'dislike'
                      ? 'bg-red-500/20 text-red-200 border-red-400/40'
                      : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                  }`}
                >
                  <ThumbsDown size={12} />
                  Dislike
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback('already_watched')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    activeFeedback === 'already_watched'
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                      : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                  }`}
                >
                  <Eye size={12} />
                  Already Watched
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback('less_like_this')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    activeFeedback === 'less_like_this'
                      ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                      : 'bg-[#101014] text-[#AAA5B3] border-white/[0.08] hover:text-[#F5F2F7]'
                  }`}
                >
                  <MinusCircle size={12} />
                  Less like this
                </button>
                <button
                  type="button"
                  onClick={() => void handleProgress(50)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border bg-[#101014] text-[#D9A45D] border-white/[0.08] hover:border-[#D9A45D]/40 transition-colors"
                >
                  <Clock size={12} />
                  In Progress (50%)
                </button>
              </div>
              {feedbackNote && (
                <p className="text-[11px] text-[#AAA5B3]">{feedbackNote}</p>
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

            {/* TV Series Seasons & Episode Browser */}
            {movie.seasons.length > 0 && (
              <div className="pt-4 space-y-3">
                <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.16em] uppercase text-[#77727F]">
                  <Tv size={13} />
                  Seasons & Episodes ({movie.seasons.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl">
                  {movie.seasons.slice(0, 9).map((season, idx) => {
                    const sNum = season.number ?? idx + 1;
                    const isOpen = expandedSeason === sNum;
                    return (
                      <button
                        key={season.id}
                        type="button"
                        onClick={() => handleToggleSeason(sNum)}
                        aria-expanded={isOpen}
                        className={`text-left p-3.5 rounded-xl border transition-colors space-y-1 ${
                          isOpen
                            ? 'bg-[#8060A8]/20 border-[#A68BC7]'
                            : 'bg-[#17161D] border-white/[0.08] hover:border-white/[0.16]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[#F5F2F7]">
                            {season.name || `Season ${sNum}`}
                          </p>
                          {isOpen ? (
                            <ChevronUp size={14} className="text-[#A68BC7]" />
                          ) : (
                            <ChevronDown size={14} className="text-[#77727F]" />
                          )}
                        </div>
                        <p className="text-xs text-[#77727F]">
                          {[
                            season.episode_count ? `${season.episode_count} episodes` : null,
                            season.air_date ? releaseYear(season.air_date) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Click to inspect episodes'}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {expandedSeason !== null && (
                  <div className="max-w-3xl rounded-2xl bg-[#17161D] border border-white/[0.08] p-4 space-y-3">
                    <p className="text-xs font-semibold tracking-[0.12em] uppercase text-[#A68BC7]">
                      Season {expandedSeason} Episodes
                    </p>
                    {loadingSeason === expandedSeason ? (
                      <p className="text-xs text-[#AAA5B3]">Loading episodes from Watchmode…</p>
                    ) : (episodesBySeason[expandedSeason] ?? []).length === 0 ? (
                      <p className="text-xs text-[#77727F]">
                        No episode guide entries returned for Season {expandedSeason}.
                      </p>
                    ) : (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {(episodesBySeason[expandedSeason] ?? []).map((ep) => (
                          <div
                            key={ep.id}
                            className="p-3 rounded-xl bg-[#101014]/80 border border-white/[0.06] space-y-1"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs sm:text-sm font-medium text-[#F5F2F7]">
                                {ep.episode_number != null ? `E${ep.episode_number} · ` : ''}
                                {ep.name || 'Untitled Episode'}
                              </p>
                              <span className="text-[11px] text-[#77727F]">
                                {[
                                  ep.runtime_minutes ? `${ep.runtime_minutes} min` : null,
                                  ep.release_date || null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </div>
                            {ep.overview && (
                              <p className="text-xs text-[#AAA5B3] line-clamp-2">{ep.overview}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <p className="pt-2 text-[11px] text-[#77727F]">
              {movie.attribution}
            </p>
          </div>
        </div>
      </Container>

      {/* Hybrid ML Similar Recommendations */}
      {mlSimilar.length > 0 && (
        <section className="pt-8 pb-10 border-t border-white/[0.06]">
          <Container className="space-y-5">
            <div className="space-y-1">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] uppercase text-[#A68BC7]">
                <Sparkles size={12} />
                CINEVERSE Hybrid ML Engine
              </p>
              <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#F5F2F7]">
                Recommended Because You Viewed This
              </h2>
              <p className="text-xs sm:text-sm text-[#AAA5B3]">
                TF-IDF content similarity blended with MovieLens collaborative SVD factors.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mlSimilar.slice(0, 6).map((rec) => {
                const targetHref = rec.content_id
                  ? `/movie/${rec.content_id}`
                  : `/discover?q=${encodeURIComponent(rec.title)}`;
                return (
                  <Link
                    key={`${rec.movielens_id ?? rec.title}`}
                    href={targetHref}
                    className="group p-4 rounded-2xl bg-[#17161D] border border-white/[0.08] hover:border-[#8060A8]/50 transition-colors flex gap-3.5"
                  >
                    <div className="w-16 h-24 rounded-lg overflow-hidden bg-[#101014] shrink-0 relative border border-white/[0.06]">
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
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-sm font-semibold text-[#F5F2F7] group-hover:text-[#A68BC7] truncate transition-colors">
                        {rec.title}
                      </p>
                      <p className="text-[11px] text-[#77727F]">
                        {[
                          rec.release_year,
                          rec.rating ? `★ ${rec.rating.toFixed(1)}` : null,
                          rec.genres.slice(0, 2).join(', '),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="text-xs text-[#AAA5B3] line-clamp-2">{rec.explanation}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Container>
        </section>
      )}

      {/* Metadata-based Similar Titles */}
      {similar.length > 0 && (
        <div className="pt-6 pb-16 border-t border-white/[0.06]">
          <MovieSection
            id="similar-movies"
            overline="Watchmode Metadata Match"
            title="Similar Titles"
            subtitle="Catalog-matched similar titles from Watchmode."
            movies={similar}
            serifTitle
          />
        </div>
      )}
    </div>
  );
}
