/**
 * PosterFallback — refined CINEVERSE fallback when poster artwork is unavailable.
 *
 * Displays a subtle layered dark background, minimal film icon,
 * movie title, and optional year/genre rather than a broken image icon
 * or blank rectangle.
 */

import { Film } from 'lucide-react';

interface PosterFallbackProps {
  title: string;
  year?: number | string | null;
  genre?: string | null;
  compact?: boolean;
}

export function PosterFallback({
  title,
  year,
  genre,
  compact = false,
}: PosterFallbackProps) {
  return (
    <div
      className="absolute inset-0 flex flex-col justify-between p-4 select-none overflow-hidden"
      style={{
        background:
          'linear-gradient(155deg, #221F2D 0%, #17161D 55%, #121117 100%)',
      }}
    >
      {/* Subtle decorative radial accent */}
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(128,96,168,0.18) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Top icon mark */}
      <div className="relative flex items-center justify-between">
        <div
          className={`${
            compact ? 'w-7 h-7' : 'w-9 h-9'
          } rounded-lg bg-[#101014]/70 border border-white/[0.08] flex items-center justify-center`}
        >
          <Film
            size={compact ? 13 : 16}
            className="text-[#A68BC7]"
            strokeWidth={1.75}
          />
        </div>
        {!compact && (
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-[#77727F]">
            CINEVERSE
          </span>
        )}
      </div>

      {/* Bottom title & metadata */}
      {!compact && (
        <div className="relative space-y-1.5 pt-4">
          <p
            className="text-base font-semibold text-[#F5F2F7] leading-snug line-clamp-3"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            {title}
          </p>
          {(year || genre) && (
            <p className="text-[11px] text-[#AAA5B3] truncate">
              {[year, genre].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
