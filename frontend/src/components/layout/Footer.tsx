/**
 * Footer — CINEVERSE site footer.
 *
 * Full-bleed dark surface with inner content wrapped in Container
 * so columns align identically to the rest of the page.
 */

import Link from 'next/link';
import { Clapperboard } from 'lucide-react';
import { Container } from '@/components/ui/Container';

const COPYRIGHT_YEAR = 2026;

const EXPLORE_LINKS = [
  { label: 'Home',         href: '/'            },
  { label: 'Discover',     href: '/discover'    },
  { label: 'Collections',  href: '/collections' },
  { label: 'My Watchlist', href: '/watchlist'   },
  { label: 'MIRA',         href: '/assistant'   },
] as const;

const COMPANY_LINKS = [
  { label: 'About',     href: '/about'   },
  { label: 'Privacy',   href: '/privacy' },
  { label: 'Profile',   href: '/profile' },
  { label: 'Analytics', href: '/admin'   },
] as const;

export function Footer() {
  return (
    <footer
      className="mt-20 lg:mt-24 w-full"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: '#0D0C11',
      }}
    >
      <Container className="py-14 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-12">
          {/* Column 1: Brand & Description */}
          <div className="md:col-span-5 flex flex-col gap-4 max-w-sm">
            <Link
              href="/"
              className="flex items-center gap-2.5 group w-fit"
              aria-label="CINEVERSE home"
            >
              <div className="w-7 h-7 rounded-lg bg-[#8060A8] flex items-center justify-center flex-shrink-0 group-hover:bg-[#A68BC7] transition-colors">
                <Clapperboard
                  size={14}
                  className="text-[#101014]"
                  strokeWidth={2.2}
                />
              </div>
              <span className="text-base font-bold tracking-[0.14em] text-[#F5F2F7]">
                CINEVERSE
              </span>
            </Link>
            <p className="text-sm text-[#77727F] leading-relaxed">
              An intelligent movie discovery platform. Find films that match your
              taste, guided by MIRA — your personal AI film companion.
            </p>
            <p
              className="text-xs text-[#AAA5B3] italic"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              Discover Beyond the Ordinary.
            </p>
          </div>

          {/* Column 2: Explore Navigation */}
          <div className="md:col-span-4">
            <h3 className="text-xs font-semibold tracking-[0.15em] uppercase text-[#77727F] mb-4">
              Explore
            </h3>
            <ul className="space-y-2.5" role="list">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#AAA5B3] hover:text-[#F5F2F7] transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Company & Information */}
          <div className="md:col-span-3">
            <h3 className="text-xs font-semibold tracking-[0.15em] uppercase text-[#77727F] mb-4">
              Information
            </h3>
            <ul className="space-y-2.5" role="list">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#AAA5B3] hover:text-[#F5F2F7] transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom row */}
        <div
          className="mt-12 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs text-[#77727F]">
            © {COPYRIGHT_YEAR} CINEVERSE. Built as a college internship project.
          </p>
          <p className="text-xs text-[#77727F]">
            Powered by <span className="text-[#A68BC7]">MIRA</span> · Streaming &
            title metadata powered by{' '}
            <a
              href="https://www.watchmode.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#AAA5B3] hover:text-[#F5F2F7] transition-colors"
            >
              Watchmode.com
            </a>
          </p>
        </div>
      </Container>
    </footer>
  );
}
