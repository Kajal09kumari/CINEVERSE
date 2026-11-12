'use client';

/**
 * MovieCard — consistent 2:3 poster card for carousels and grids.
 *
 * Shows Watchmode poster URL when available, or renders the polished CINEVERSE
 * PosterFallback component when missing/unavailable.
 * Maintains uniform card height with two-line title support across grids.
 */

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Star, Calendar } from 'lucide-react';
import { PosterFallback } from './PosterFallback';
import { contentImageUrl, releaseYear } from '@/lib/utils';
import { resolveMovieGenres } from '@/services/movieService';
import type { Movie } from '@/types';

interface MovieCardProps {
  movie: Movie;
  genreMap?: Record<number, string>;
  className?: string;
}

export function MovieCard({
  movie,
  genreMap,
  className = '',
}: MovieCardProps) {
  const [imgError, setImgError] = useState(false);
  const yearStr = releaseYear(movie.release_date);
  const yearNum = yearStr ? Number(yearStr) : null;
  const genre = resolveMovieGenres(movie, genreMap)[0] ?? null;
  const posterSrc = !imgError ? contentImageUrl(movie.poster_path) : null;
  const typeBadge =
    movie.content_type === 'DOCUMENTARY' || movie.is_documentary
      ? 'Documentary'
      : movie.content_type === 'TV_SERIES'
        ? 'Series'
        : null;

  return (
    <Link
      href={`/movie/${movie.id}`}
      className={`group flex-shrink-0 block h-full ${className}`}
      aria-label={`View details for ${movie.title}`}
    >
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className="flex flex-col h-full gap-3"
      >
        {/* Poster container (strict 2:3 ratio) */}
        <div
          className="relative w-full overflow-hidden rounded-xl bg-[#1C1A23] border border-white/[0.08]"
          style={{ aspectRatio: '2 / 3' }}
        >
          {posterSrc ? (
            <Image
              src={posterSrc}
              alt={`${movie.title} poster`}
              fill
              sizes="(max-width: 640px) 168px, (max-width: 1024px) 190px, 212px"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            <PosterFallback title={movie.title} year={yearNum} genre={genre} />
          )}

          {/* Content type badge (Series / Documentary) */}
          {typeBadge && (
            <div
              className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide uppercase text-[#F5F2F7] border border-white/[0.12]"
              style={{
                background: 'rgba(16, 16, 20, 0.82)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {typeBadge}
            </div>
          )}

          {/* Rating badge */}
          {movie.vote_average > 0 && (
            <div
              className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
              style={{
                background: 'rgba(16, 16, 20, 0.85)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Star size={10} className="text-[#D9A45D]" fill="#D9A45D" />
              <span className="text-[#F5F2F7]">
                {movie.vote_average.toFixed(1)}
              </span>
            </div>
          )}

          {/* Hover overlay */}
          <div
            className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-3.5 flex flex-col justify-end"
            style={{
              background:
                'linear-gradient(to top, rgba(16,16,20,0.96) 0%, rgba(16,16,20,0.5) 55%, transparent 100%)',
            }}
            aria-hidden="true"
          >
            {movie.overview && (
              <p className="text-xs text-[#AAA5B3] leading-relaxed line-clamp-4 mb-2">
                {movie.overview}
              </p>
            )}
            <span className="text-xs font-medium text-[#A68BC7]">
              View details →
            </span>
          </div>
        </div>

        {/* Meta below poster — uniform two-line title box + single-line submeta */}
        <div className="flex flex-col flex-1 justify-between gap-1.5 min-w-0">
          <h3 className="text-sm font-medium text-[#F5F2F7] leading-[1.35] line-clamp-2 min-h-[2.45rem] group-hover:text-white transition-colors">
            {movie.title}
          </h3>
          <div className="flex items-center gap-2 text-xs text-[#77727F]">
            {yearStr && (
              <span className="flex items-center gap-1 flex-shrink-0">
                <Calendar size={10} />
                {yearStr}
              </span>
            )}
            {genre && (
              <>
                {yearStr && (
                  <span
                    className="w-0.5 h-0.5 rounded-full bg-[#77727F] flex-shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">{genre}</span>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
