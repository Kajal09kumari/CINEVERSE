'use client';

/**
 * MovieCarousel — horizontally scrollable movie row aligned inside Container.
 *
 * Supports async loading skeletons, clean error states with retry,
 * and consistent non-overlapping header arrow controls.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, AlertCircle, RotateCcw, ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { MovieCard } from './MovieCard';
import { MovieCardSkeleton } from '@/components/ui/LoadingState';
import { SectionHeading } from '@/components/ui/SectionHeading';
import type { Movie } from '@/types';

interface MovieCarouselProps {
  title: string;
  subtitle?: string;
  overline?: string;
  movies: Movie[];
  genreMap?: Record<number, string>;
  serifTitle?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  viewAllHref?: string;
}

export function MovieCarousel({
  title,
  subtitle,
  overline,
  movies,
  genreMap,
  serifTitle = false,
  loading = false,
  error = null,
  onRetry,
  viewAllHref,
}: MovieCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState, { passive: true });
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, movies.length]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.78;
    el.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  }, []);

  if (!loading && !error && movies.length === 0) return null;

  const headingId = `section-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <section aria-labelledby={headingId} className="w-full min-w-0">
      <Container>
        {/* Header row with non-overlapping controls */}
        <div className="flex items-end justify-between gap-4 mb-6">
          <SectionHeading
            id={headingId}
            overline={overline}
            title={title}
            subtitle={subtitle}
            serif={serifTitle}
          />

          <div className="flex items-center gap-3 flex-shrink-0">
            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-[#A68BC7] hover:text-[#F5F2F7] transition-colors mr-1"
              >
                Explore all
                <ArrowRight size={13} />
              </Link>
            )}
            {!loading && !error && (
              <div className="hidden sm:flex items-center gap-2">
                <ScrollButton
                  direction="left"
                  disabled={!canScrollLeft}
                  onClick={() => scroll('left')}
                />
                <ScrollButton
                  direction="right"
                  disabled={!canScrollRight}
                  onClick={() => scroll('right')}
                />
              </div>
            )}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex gap-5 overflow-hidden pb-1">
            {Array.from({ length: 6 }).map((_, idx) => (
              <MovieCardSkeleton key={idx} />
            ))}
          </div>
        )}

        {/* Error state (no fake fallback movies) */}
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
                  Unable to load {title.toLowerCase()}
                </p>
                <p className="text-xs text-[#AAA5B3] mt-1">{error}</p>
              </div>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[#1C1A23] hover:bg-[#8060A8]/20 text-[#F5F2F7] border border-white/[0.1] transition-colors w-fit flex-shrink-0"
              >
                <RotateCcw size={13} />
                Retry
              </button>
            )}
          </div>
        )}

        {/* Carousel track */}
        {!loading && !error && (
          <div className="relative w-full min-w-0">
            <AnimatePresence>
              {canScrollLeft && (
                <motion.div
                  key="left-fade"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="pointer-events-none hidden sm:block absolute left-0 top-0 bottom-2 w-10 z-20"
                  style={{
                    background: 'linear-gradient(to right, #101014, transparent)',
                  }}
                  aria-hidden="true"
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {canScrollRight && (
                <motion.div
                  key="right-fade"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="pointer-events-none hidden sm:block absolute right-0 top-0 bottom-2 w-10 z-20"
                  style={{
                    background: 'linear-gradient(to left, #101014, transparent)',
                  }}
                  aria-hidden="true"
                />
              )}
            </AnimatePresence>

            <div
              ref={scrollRef}
              className="flex items-stretch gap-5 overflow-x-auto max-w-full scrollbar-hide scroll-smooth"
              role="list"
              aria-label={`${title} movies`}
            >
              {movies.map((movie) => (
                <div key={movie.id} role="listitem" className="flex-shrink-0">
                  <MovieCard
                    movie={movie}
                    genreMap={genreMap}
                    className="w-[168px] sm:w-[190px] lg:w-[212px]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}

interface ScrollButtonProps {
  direction: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}

function ScrollButton({ direction, disabled, onClick }: ScrollButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 bg-[#17161D] hover:bg-[#1C1A23] border border-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label={direction === 'left' ? 'Scroll left' : 'Scroll right'}
    >
      {direction === 'left' ? (
        <ChevronLeft size={18} className="text-[#F5F2F7]" />
      ) : (
        <ChevronRight size={18} className="text-[#F5F2F7]" />
      )}
    </button>
  );
}
