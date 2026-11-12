'use client';

/**
 * WatchlistPage — local browser prototype for saved movies inside Container.
 */

import Link from 'next/link';
import { Bookmark, Trash2, ArrowLeft } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';
import { MovieCard } from '@/components/movies/MovieCard';
import { Button } from '@/components/ui/Button';
import { useWatchlist } from '@/hooks/useWatchlist';

export default function WatchlistPage() {
  const { items, hydrated, toggleWatchlist, clearWatchlist } = useWatchlist();

  return (
    <div className="min-h-screen flex flex-col bg-[#101014] text-[#F5F2F7]">
      <Navbar />
      <main className="flex-1">
        <Container className="pt-28 pb-16">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-[#AAA5B3] hover:text-[#F5F2F7] mb-6 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Home
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-6 border-b border-white/[0.08]">
            <div>
              <span className="text-xs font-medium tracking-[0.2em] uppercase text-[#D9A45D] block mb-2">
                Local Prototype
              </span>
              <h1
                className="text-3xl sm:text-4xl font-semibold text-[#F5F2F7]"
                style={{ fontFamily: 'var(--font-playfair)' }}
              >
                My Watchlist
              </h1>
              <p className="text-sm text-[#AAA5B3] mt-2">
                Saved locally in your browser. Cloud sync with Supabase arrives
                in later phases.
              </p>
            </div>

            {hydrated && items.length > 0 && (
              <Button onClick={clearWatchlist} variant="secondary" size="sm">
                <Trash2 size={14} />
                Clear all
              </Button>
            )}
          </div>

          {!hydrated ? (
            <p className="text-sm text-[#77727F]">Loading watchlist...</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4 rounded-2xl bg-[#17161D] border border-white/[0.08]">
              <div className="w-14 h-14 rounded-2xl bg-[#1C1A23] border border-white/[0.08] flex items-center justify-center">
                <Bookmark size={24} className="text-[#D9A45D]" />
              </div>
              <h2 className="text-xl font-semibold text-[#F5F2F7]">
                Your watchlist is empty
              </h2>
              <p className="text-sm text-[#AAA5B3] max-w-sm px-4">
                Click &ldquo;Add to Watchlist&rdquo; on the featured film or any
                movie detail page to save titles here.
              </p>
              <Button href="/" variant="primary" size="md">
                Explore Films
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {items.map((movie) => (
                <div key={movie.id} className="flex flex-col gap-2">
                  <MovieCard movie={movie} className="w-full" />
                  <button
                    type="button"
                    onClick={() => toggleWatchlist(movie)}
                    className="text-xs text-[#77727F] hover:text-[#F5F2F7] text-left px-0.5 transition-colors"
                  >
                    Remove from watchlist
                  </button>
                </div>
              ))}
            </div>
          )}
        </Container>
      </main>
      <Footer />
    </div>
  );
}
