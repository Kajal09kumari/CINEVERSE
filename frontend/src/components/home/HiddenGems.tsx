'use client';

/**
 * HiddenGems — editorial 1+3 showcase for highly rated, acclaimed cinema.
 *
 * Uses Watchmode `/api/content/discover` metadata criteria (rating >= 7.5,
 * sorted by rating_desc) — NOT the ML engine (clearly noted in UI).
 */

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Star, ArrowUpRight, AlertCircle, RotateCcw } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Skeleton } from '@/components/ui/LoadingState';
import { PosterFallback } from '@/components/movies/PosterFallback';
import { contentImageUrl, releaseYear } from '@/lib/utils';
import { discoverMovies, resolveMovieGenres } from '@/services/movieService';
import type { Movie } from '@/types';

interface HiddenGemsProps {
  genreMap?: Record<number, string>;
}

export function HiddenGems({ genreMap }: HiddenGemsProps) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRetryTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    discoverMovies({
      content_type: 'MOVIE',
      min_rating: 7.5,
      sort_by: 'rating_desc',
      page: 1,
    })
      .then((data) => {
        if (!active) return;
        setMovies(data.results.slice(0, 4));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load Hidden Gems from Watchmode.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retryTick]);

  const [featured, ...supporting] = movies;

  return (
    <section aria-labelledby="gems-heading">
      <Container>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-7">
          <SectionHeading
            id="gems-heading"
            overline="Watchmode acclaim selection"
            title="Hidden Gems"
            subtitle="Acclaimed stories with high ratings outside blockbuster volume."
            serif
          />
          <Link
            href="/discover?min_rating=7.5&sort_by=rating_desc"
            className="text-xs font-medium text-[#A68BC7] hover:text-[#F5F2F7] transition-colors flex-shrink-0"
          >
            Browse more acclaim →
          </Link>
        </div>

        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <Skeleton className="lg:col-span-7 h-72 sm:h-96 min-h-[360px] rounded-2xl" />
            <div className="lg:col-span-5 flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="rounded-2xl bg-[#17161D] border border-white/[0.08] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                size={18}
                className="text-[#D9A45D] flex-shrink-0 mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-[#F5F2F7]">
                  Unable to load Hidden Gems
                </p>
                <p className="text-xs text-[#AAA5B3] mt-1">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[#1C1A23] hover:bg-[#8060A8]/20 text-[#F5F2F7] border border-white/[0.1] transition-colors w-fit flex-shrink-0"
            >
              <RotateCcw size={13} />
              Retry
            </button>
          </div>
        )}

        {!loading && !error && featured && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <motion.div
              className="lg:col-span-7"
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5 }}
            >
              <FeaturedGemCard movie={featured} genreMap={genreMap} />
            </motion.div>

            <div className="lg:col-span-5 flex flex-col gap-4 justify-between">
              {supporting.slice(0, 3).map((movie, index) => (
                <motion.div
                  key={movie.id}
                  initial={{ opacity: 0, x: 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: 0.08 + index * 0.07 }}
                  className="flex-1"
                >
                  <SupportingGemCard movie={movie} genreMap={genreMap} />
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}

function FeaturedGemCard({
  movie,
  genreMap,
}: {
  movie: Movie;
  genreMap?: Record<number, string>;
}) {
  const [imgError, setImgError] = useState(false);
  const year = releaseYear(movie.release_date);
  const primaryGenre = resolveMovieGenres(movie, genreMap)[0] ?? null;
  const backdropSrc = !imgError
    ? contentImageUrl(movie.backdrop_path ?? movie.poster_path)
    : null;

  return (
    <Link
      href={`/movie/${movie.id}`}
      className="group relative block rounded-2xl overflow-hidden h-72 sm:h-96 lg:h-full min-h-[360px] bg-[#17161D] border border-white/[0.08]"
      aria-label={`Discover ${movie.title}`}
    >
      {backdropSrc ? (
        <Image
          src={backdropSrc}
          alt={`${movie.title} backdrop`}
          fill
          sizes="(max-width: 1024px) 100vw, 58vw"
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ filter: 'brightness(0.62)' }}
          onError={() => setImgError(true)}
        />
      ) : (
        <PosterFallback
          title={movie.title}
          year={year ? Number(year) : null}
          genre={primaryGenre}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(16,16,20,0.96) 0%, rgba(16,16,20,0.35) 55%, transparent 100%)',
        }}
        aria-hidden="true"
      />
      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium tracking-[0.18em] uppercase text-[#A68BC7]">
            Featured Selection
          </span>
          <ArrowUpRight
            size={16}
            className="text-[#AAA5B3] group-hover:text-white transition-colors"
          />
        </div>
        <h3
          className="text-2xl sm:text-3xl font-bold text-[#F5F2F7] mb-2 leading-tight"
          style={{ fontFamily: 'var(--font-playfair)' }}
        >
          {movie.title}
        </h3>
        <div className="flex flex-wrap items-center gap-3 mb-3 text-xs sm:text-sm">
          {year && <span className="text-[#AAA5B3]">{year}</span>}
          {movie.vote_average > 0 && (
            <span className="flex items-center gap-1 text-[#D9A45D] font-medium">
              <Star size={12} fill="#D9A45D" strokeWidth={0} />
              {movie.vote_average.toFixed(1)}
            </span>
          )}
          {primaryGenre && <span className="text-[#AAA5B3]">{primaryGenre}</span>}
        </div>
        <p className="text-xs sm:text-sm text-[#AAA5B3] line-clamp-2 max-w-xl leading-relaxed">
          {movie.overview}
        </p>
      </div>
    </Link>
  );
}

function SupportingGemCard({
  movie,
  genreMap,
}: {
  movie: Movie;
  genreMap?: Record<number, string>;
}) {
  const [imgError, setImgError] = useState(false);
  const year = releaseYear(movie.release_date);
  const primaryGenre = resolveMovieGenres(movie, genreMap)[0] ?? null;
  const posterSrc = !imgError ? contentImageUrl(movie.poster_path) : null;

  return (
    <Link
      href={`/movie/${movie.id}`}
      className="group flex items-center gap-4 h-full p-4 rounded-xl bg-[#17161D] hover:bg-[#1C1A23] border border-white/[0.08] hover:border-white/[0.16] transition-all duration-200"
      aria-label={`Discover ${movie.title}`}
    >
      <div className="relative w-16 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-[#1C1A23] border border-white/[0.06]">
        {posterSrc ? (
          <Image
            src={posterSrc}
            alt={`${movie.title} poster`}
            fill
            sizes="64px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <PosterFallback title={movie.title} compact />
        )}
      </div>
      <div className="flex flex-col justify-center gap-1 min-w-0 flex-1">
        <h3 className="text-sm sm:text-base font-semibold text-[#F5F2F7] leading-snug line-clamp-1 group-hover:text-white transition-colors">
          {movie.title}
        </h3>
        <div className="flex items-center gap-2 text-xs text-[#77727F]">
          {year && <span>{year}</span>}
          {primaryGenre && (
            <>
              {year && <span aria-hidden="true">·</span>}
              <span className="truncate">{primaryGenre}</span>
            </>
          )}
        </div>
        <p className="text-xs text-[#AAA5B3] line-clamp-2 leading-relaxed mt-0.5">
          {movie.overview}
        </p>
        {movie.vote_average > 0 && (
          <span className="flex items-center gap-1 text-xs text-[#D9A45D] font-medium mt-0.5">
            <Star size={11} fill="#D9A45D" strokeWidth={0} />
            {movie.vote_average.toFixed(1)}
          </span>
        )}
      </div>
    </Link>
  );
}
