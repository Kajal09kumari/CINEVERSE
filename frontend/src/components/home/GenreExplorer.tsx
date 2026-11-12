'use client';

/**
 * GenreExplorer — "Explore Your Universe." section aligned inside Container.
 */

import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Rocket,
  Crosshair,
  Search,
  Heart,
  Drama,
  Laugh,
  Ghost,
  Compass,
  Wand2,
  Camera,
  ArrowUpRight,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';

interface GenreItem {
  label: string;
  slug: string;
  tagline: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  variant: 'wide-violet' | 'wide-amber' | 'compact';
}

const GENRES: GenreItem[] = [
  {
    label: 'Science Fiction',
    slug: 'Science%20Fiction',
    tagline: 'Future worlds & cosmic scale',
    Icon: Rocket,
    variant: 'wide-violet',
  },
  {
    label: 'Thriller',
    slug: 'Thriller',
    tagline: 'Tension & sharp turns',
    Icon: Crosshair,
    variant: 'compact',
  },
  {
    label: 'Mystery',
    slug: 'Mystery',
    tagline: 'Clues & hidden motives',
    Icon: Search,
    variant: 'compact',
  },
  {
    label: 'Romance',
    slug: 'Romance',
    tagline: 'Stories of devotion',
    Icon: Heart,
    variant: 'compact',
  },
  {
    label: 'Drama',
    slug: 'Drama',
    tagline: 'Character-driven cinema',
    Icon: Drama,
    variant: 'wide-amber',
  },
  {
    label: 'Comedy',
    slug: 'Comedy',
    tagline: 'Wit & levity',
    Icon: Laugh,
    variant: 'compact',
  },
  {
    label: 'Horror',
    slug: 'Horror',
    tagline: 'Atmosphere & dread',
    Icon: Ghost,
    variant: 'compact',
  },
  {
    label: 'Adventure',
    slug: 'Adventure',
    tagline: 'Uncharted expeditions',
    Icon: Compass,
    variant: 'compact',
  },
  {
    label: 'Animation',
    slug: 'Animation',
    tagline: 'Crafted imagination',
    Icon: Wand2,
    variant: 'compact',
  },
  {
    label: 'Documentary',
    slug: 'Documentary',
    tagline: 'Real voices & true accounts',
    Icon: Camera,
    variant: 'wide-violet',
  },
];

export function GenreExplorer() {
  return (
    <section aria-labelledby="genre-heading">
      <Container>
        <SectionHeading
          id="genre-heading"
          overline="Curated worlds"
          title="Explore Your Universe."
          subtitle="Ten genres with distinct voices, rhythms, and visual traditions."
          serif
          className="mb-7"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {GENRES.map((genre, index) => {
            const Icon = genre.Icon;
            const isWide = genre.variant !== 'compact';
            const bgStyle =
              genre.variant === 'wide-violet'
                ? 'linear-gradient(135deg, rgba(128,96,168,0.16) 0%, #17161D 70%)'
                : genre.variant === 'wide-amber'
                ? 'linear-gradient(135deg, rgba(217,164,93,0.13) 0%, #17161D 70%)'
                : '#17161D';

            const iconColor =
              genre.variant === 'wide-amber' ? 'text-[#D9A45D]' : 'text-[#A68BC7]';

            return (
              <motion.div
                key={genre.label}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.35, delay: index * 0.03 }}
                className={isWide ? 'sm:col-span-2' : 'col-span-1'}
              >
                <Link
                  href={`/discover?genre=${genre.slug}`}
                  className="group flex items-center justify-between gap-4 p-5 rounded-xl border border-white/[0.08] hover:border-white/[0.16] transition-all duration-200 hover:-translate-y-0.5 h-full"
                  style={{ background: bgStyle }}
                  aria-label={`Explore ${genre.label} movies`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-lg bg-[#101014]/80 border border-white/[0.08] flex items-center justify-center flex-shrink-0 ${iconColor}`}
                    >
                      <Icon size={18} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`font-semibold text-[#F5F2F7] group-hover:text-white transition-colors truncate ${
                          isWide ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                        }`}
                      >
                        {genre.label}
                      </p>
                      <p className="text-xs text-[#77727F] truncate mt-0.5">
                        {genre.tagline}
                      </p>
                    </div>
                  </div>

                  <ArrowUpRight
                    size={15}
                    className="text-[#77727F] group-hover:text-[#F5F2F7] flex-shrink-0 transition-colors"
                  />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
