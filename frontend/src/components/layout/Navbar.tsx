'use client';

/**
 * Navbar — CINEVERSE primary navigation.
 *
 * Uses Container for exact horizontal alignment with the page content.
 * Desktop uses a 3-column CSS Grid (grid-template-columns: 1fr auto 1fr)
 * so the navigation links sit truly centered regardless of right-group width.
 *
 * Height: 76px.
 */

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Sparkles,
  Menu,
  X,
  Clapperboard,
  Bookmark,
  User,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { MobileNav } from './MobileNav';
import { getTrendingMovies, searchMovies, resolveMovieGenres } from '@/services/movieService';
import { releaseYear } from '@/lib/utils';
import { useMiraWidget } from '@/context/MiraWidgetContext';
import type { Movie } from '@/types';

const NAV_LINKS = [
  { label: 'Home',         href: '/'            },
  { label: 'Discover',     href: '/discover'    },
  { label: 'Collections',  href: '/collections' },
  { label: 'My Watchlist', href: '/watchlist'   },
] as const;

export function Navbar() {
  return (
    <Suspense
      fallback={
        <header
          className="fixed top-0 inset-x-0 z-50 h-[76px]"
          aria-hidden="true"
        />
      }
    >
      <NavbarContent />
    </Suspense>
  );
}

function NavbarContent() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen: isMiraOpen, isMinimized: isMiraMinimized, toggleMira } = useMiraWidget();

  useEffect(() => {
    if (!searchOpen) return;
    let active = true;
    const q = searchQuery.trim();

    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = q
          ? await searchMovies(q, 1)
          : await getTrendingMovies(1);
        if (active) {
          setSearchResults(res.results.slice(0, 5));
        }
      } catch (err) {
        if (active) {
          setSearchResults([]);
          setSearchError(
            err instanceof Error ? err.message : 'Unable to search catalog right now.'
          );
        }
      } finally {
        if (active) setSearchLoading(false);
      }
    }, q ? 280 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchOpen, searchQuery]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    setSearchOpen(false);
    if (q) {
      router.push(`/discover?q=${encodeURIComponent(q)}`);
    } else {
      router.push('/discover');
    }
  }

  return (
    <>
      <header
        className="fixed top-0 inset-x-0 z-50 transition-all duration-300"
        style={{
          background: scrolled
            ? 'rgba(16, 16, 20, 0.92)'
            : 'linear-gradient(to bottom, rgba(16,16,20,0.82) 0%, rgba(16,16,20,0.35) 60%, transparent 100%)',
          backdropFilter: scrolled ? 'blur(14px)' : 'none',
          borderBottom: scrolled
            ? '1px solid rgba(255,255,255,0.08)'
            : '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <Container>
          <nav
            className="h-[76px] flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] md:items-center gap-4"
            aria-label="Main navigation"
          >
            {/* ── Left Group: Logo ──────────────────────────────────────── */}
            <div className="flex items-center justify-self-start">
              <Link
                href="/"
                className="flex items-center gap-2.5 group flex-shrink-0"
                aria-label="CINEVERSE home"
              >
                <div className="w-8 h-8 rounded-lg bg-[#8060A8] flex items-center justify-center flex-shrink-0 group-hover:bg-[#A68BC7] transition-colors duration-200">
                  <Clapperboard
                    size={16}
                    className="text-[#101014]"
                    strokeWidth={2.2}
                  />
                </div>
                <span className="text-base sm:text-lg font-bold tracking-[0.14em] text-[#F5F2F7] group-hover:text-white transition-colors whitespace-nowrap">
                  CINEVERSE
                </span>
              </Link>
            </div>

            {/* ── Centre Group: Nav Links (desktop) ─────────────────────── */}
            <ul
              className="hidden md:flex items-center justify-center gap-2 lg:gap-4 justify-self-center"
              role="list"
            >
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`
                        px-3.5 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap
                        ${
                          isActive
                            ? 'text-[#F5F2F7] bg-white/[0.08]'
                            : 'text-[#AAA5B3] hover:text-[#F5F2F7] hover:bg-white/[0.05]'
                        }
                      `}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* ── Right Group: Search, MIRA, Profile ────────────────────── */}
            <div className="flex items-center gap-2.5 justify-self-end">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[#AAA5B3] hover:text-[#F5F2F7] hover:bg-white/[0.06] transition-colors duration-200"
                aria-label="Search movies"
                aria-expanded={searchOpen}
              >
                <Search size={18} strokeWidth={1.8} />
              </button>

              <button
                type="button"
                onClick={toggleMira}
                className={`hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  isMiraOpen && !isMiraMinimized
                    ? 'bg-[#8060A8] text-white shadow-[0_0_18px_rgba(128,96,168,0.5)] border border-[#A68BC7]'
                    : 'bg-[#8060A8]/25 hover:bg-[#8060A8]/40 text-[#F5F2F7] border border-[#8060A8]/40'
                }`}
                aria-label="Toggle MIRA AI film assistant"
                aria-expanded={isMiraOpen && !isMiraMinimized}
              >
                <Sparkles
                  size={14}
                  className={isMiraOpen && !isMiraMinimized ? 'text-white' : 'text-[#A68BC7]'}
                  strokeWidth={2}
                />
                <span>MIRA</span>
              </button>

              <Link
                href="/profile"
                className="hidden sm:flex w-9 h-9 items-center justify-center rounded-full bg-[#1C1A23] border border-white/[0.1] text-[#AAA5B3] hover:text-[#F5F2F7] hover:border-[#8060A8]/50 transition-colors duration-200 flex-shrink-0"
                aria-label="User profile"
                title="Profile & Taste Preferences"
              >
                <User size={16} strokeWidth={1.8} />
              </Link>

              <Link
                href="/watchlist"
                className="sm:hidden w-9 h-9 flex items-center justify-center rounded-lg text-[#AAA5B3] hover:text-[#F5F2F7] hover:bg-white/[0.06] transition-colors duration-200"
                aria-label="My watchlist"
              >
                <Bookmark size={18} strokeWidth={1.8} />
              </Link>

              <button
                type="button"
                className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-[#AAA5B3] hover:text-[#F5F2F7] hover:bg-white/[0.06] transition-colors duration-200"
                onClick={() => setMobileOpen((prev) => !prev)}
                aria-expanded={mobileOpen}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </nav>
        </Container>
      </header>

      {/* Interactive Search Dialog */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            key="search-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-24 sm:pt-28 px-5 bg-black/75"
            onClick={() => setSearchOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Search CINEVERSE"
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg rounded-2xl overflow-hidden bg-[#17161D] border border-white/[0.12] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <form
                onSubmit={handleSearchSubmit}
                className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08]"
              >
                <Search size={18} className="text-[#AAA5B3] flex-shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search films or genres (e.g. Interstellar, Drama)..."
                  className="w-full bg-transparent text-sm text-[#F5F2F7] placeholder:text-[#77727F] focus:outline-none"
                  aria-label="Search movies"
                />
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="text-[#77727F] hover:text-[#F5F2F7] p-1 rounded-md"
                  aria-label="Close search"
                >
                  <X size={16} />
                </button>
              </form>

              <div className="p-2 max-h-80 overflow-y-auto">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#77727F]">
                    {searchQuery.trim() ? 'Watchmode Search Matches' : 'Trending This Week'}
                  </p>
                  {searchLoading && (
                    <Loader2 size={13} className="text-[#A68BC7] animate-spin" />
                  )}
                </div>

                {searchError ? (
                  <p className="px-3 py-4 text-xs text-[#D9A45D]">
                    {searchError} Press Enter to browse Discover.
                  </p>
                ) : searchResults.length > 0 ? (
                  <ul className="space-y-1" role="list">
                    {searchResults.map((movie) => {
                      const genresText = resolveMovieGenres(movie)
                        .slice(0, 2)
                        .join(', ');
                      const year = releaseYear(movie.release_date);
                      return (
                        <li key={movie.id}>
                          <Link
                            href={`/movie/${movie.id}`}
                            onClick={() => {
                              setSearchOpen(false);
                              void import('@/services/analyticsService').then(
                                ({ trackEvent }) => {
                                  trackEvent({
                                    event_type: 'search_result_clicked',
                                    content_id: movie.id,
                                    title: movie.title,
                                    source_surface: 'navbar_search',
                                    metadata: { query: searchQuery.trim() },
                                  });
                                }
                              );
                            }}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[#F5F2F7] truncate">
                                {movie.title}
                              </p>
                              <p className="text-xs text-[#77727F] truncate">
                                {[year, genresText].filter(Boolean).join(' · ') || 'Title'}
                              </p>
                            </div>
                            <ArrowRight
                              size={14}
                              className="text-[#77727F] flex-shrink-0"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : !searchLoading ? (
                  <p className="px-3 py-4 text-sm text-[#77727F]">
                    No catalog matches for &ldquo;{searchQuery.trim()}&rdquo;. Press Enter for Discover.
                  </p>
                ) : null}
              </div>

              <div className="px-4 py-2.5 bg-[#101014]/60 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#77727F]">
                <span>Live Watchmode discovery via CINEVERSE API</span>
                <Link
                  href="/discover"
                  onClick={() => setSearchOpen(false)}
                  className="text-[#A68BC7] hover:underline"
                >
                  Open Discover
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <MobileNav
        isOpen={mobileOpen}
        links={NAV_LINKS}
        onClose={() => setMobileOpen(false)}
      />
    </>
  );
}
