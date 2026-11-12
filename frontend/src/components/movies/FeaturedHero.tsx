'use client';

/**
 * FeaturedHero — full-bleed cinematic hero with centered Container alignment.
 *
 * Background image remains 100% full width (75–84vh on desktop) while
 * editorial typography aligns cleanly inside Container (max-w-[600px]).
 */

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Clock, Star, ArrowUpRight, Bookmark, Check } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { useWatchlist } from '@/hooks/useWatchlist';
import { contentImageUrl, releaseYear } from '@/lib/utils';
import { resolveMovieGenres } from '@/services/movieService';
import type { Movie } from '@/types';

interface FeaturedHeroProps {
  movie: Movie;
  genreMap?: Record<number, string>;
  overline?: string;
}

const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const;

export function FeaturedHero({
  movie,
  genreMap,
  overline = 'TRENDING FEATURED PICK',
}: FeaturedHeroProps) {
  const { isInWatchlist, toggleWatchlist, hydrated } = useWatchlist();
  const [backdropErr, setBackdropErr] = useState(false);

  const saved = hydrated && isInWatchlist(movie.id);
  const backdropSrc = !backdropErr
    ? contentImageUrl(movie.backdrop_path ?? movie.poster_path)
    : null;

  const year = releaseYear(movie.release_date);
  const runtime = movie.runtime ?? 0;
  const runtimeHours = Math.floor(runtime / 60);
  const runtimeMinutes = runtime % 60;
  const runtimeStr =
    runtime > 0 ? `${runtimeHours}h ${runtimeMinutes}m` : null;
  const genres = resolveMovieGenres(movie, genreMap);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
  };
  const item = {
    hidden: { opacity: 0, y: 18 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: EASE_OUT },
    },
  };

  return (
    <section
      className="relative w-full min-h-[76vh] lg:min-h-[82vh] max-h-[880px] flex items-end overflow-hidden bg-[#17161D]"
      aria-label={`Featured film: ${movie.title}`}
    >
      {/* ── Full-bleed backdrop image ──────────────────────────────── */}
      {backdropSrc && (
        <motion.div
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
          className="absolute inset-0"
          aria-hidden="true"
        >
          <Image
            src={backdropSrc}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
            style={{ filter: 'brightness(0.72)' }}
            onError={() => setBackdropErr(true)}
          />
        </motion.div>
      )}

      {/* ── Layered gradient overlays ──────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: `
            linear-gradient(to right, rgba(16,16,20,0.92) 0%, rgba(16,16,20,0.68) 46%, rgba(16,16,20,0.18) 100%),
            linear-gradient(to top, #101014 0%, rgba(16,16,20,0.45) 30%, transparent 65%),
            linear-gradient(to bottom, rgba(16,16,20,0.55) 0%, transparent 25%)
          `,
        }}
      />

      {/* ── Text content inside centered Container ─────────────────── */}
      <Container className="relative pt-28 pb-14 sm:pb-16 lg:pb-20">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="w-full max-w-[600px]"
        >
          {/* Overline label */}
          <motion.div variants={item} className="mb-4">
            <span className="inline-flex items-center gap-2.5 text-xs font-semibold tracking-[0.2em] uppercase text-[#D9A45D]">
              <span className="w-6 h-px bg-[#D9A45D]" aria-hidden="true" />
              {overline}
            </span>
          </motion.div>

          {/* Editorial Title */}
          <motion.h1
            variants={item}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#F5F2F7] leading-[1.06] tracking-tight mb-5"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            {movie.title}
          </motion.h1>

          {/* Metadata row */}
          <motion.div
            variants={item}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5"
          >
            {movie.vote_average > 0 && (
              <span
                className="flex items-center gap-1.5 text-sm text-[#D9A45D] font-semibold"
                title={movie.rating_source ? `${movie.rating_source} rating` : 'Public rating'}
              >
                <Star size={14} fill="#D9A45D" strokeWidth={0} />
                {movie.vote_average.toFixed(1)}
              </span>
            )}

            {(movie.content_type === 'TV_SERIES' || movie.content_type === 'DOCUMENTARY' || movie.is_documentary) && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium text-[#F5F2F7] bg-white/[0.08] border border-white/[0.12]">
                {movie.content_type === 'DOCUMENTARY' || movie.is_documentary
                  ? 'Documentary'
                  : 'TV Series'}
              </span>
            )}

            {year && <span className="text-sm text-[#AAA5B3]">{year}</span>}

            {runtimeStr && (
              <span className="flex items-center gap-1.5 text-sm text-[#AAA5B3]">
                <Clock size={13} />
                {runtimeStr}
              </span>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {genres.slice(0, 3).map((genre) => (
                <span
                  key={genre}
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium text-[#A68BC7] bg-[#8060A8]/18 border border-[#8060A8]/30"
                >
                  {genre}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Synopsis */}
          <motion.p
            variants={item}
            className="text-sm sm:text-base text-[#AAA5B3] leading-relaxed mb-8 line-clamp-3"
          >
            {movie.overview}
          </motion.p>

          {/* Actions */}
          <motion.div variants={item} className="flex flex-wrap items-center gap-3">
            <Button
              href={`/movie/${movie.id}`}
              variant="primary"
              size="md"
              className="sm:px-7 sm:py-3.5 sm:text-base"
              aria-label={`Explore ${movie.title}`}
            >
              {movie.content_type === 'TV_SERIES' ? 'Explore Series' : 'Explore Title'}
              <ArrowUpRight size={16} />
            </Button>

            <Button
              onClick={() => toggleWatchlist(movie)}
              variant={saved ? 'amber' : 'secondary'}
              size="md"
              className="sm:px-7 sm:py-3.5 sm:text-base"
              aria-pressed={saved}
              aria-label={
                saved
                  ? `Remove ${movie.title} from watchlist`
                  : `Add ${movie.title} to watchlist`
              }
            >
              {saved ? <Check size={16} /> : <Bookmark size={16} />}
              {saved ? 'In Watchlist' : 'Add to Watchlist'}
            </Button>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}
