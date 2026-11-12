'use client';

/**
 * MoodDiscovery — "WHAT'S YOUR MOOD TONIGHT?" section.
 *
 * Uses Container for global alignment.
 * Desktop: 3 columns, Tablet: 2 columns, Mobile: 1 column.
 * All cards maintain consistent heights, generous inner padding,
 * and clear navigation actions.
 */

import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Smile,
  Orbit,
  Heart,
  Moon,
  Sun,
  Zap,
  ArrowUpRight,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';

interface MoodItem {
  id: string;
  label: string;
  sublabel: string;
  slug: string;
  accentColor: string;
  surfaceTint: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}

const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const;

const MOODS: MoodItem[] = [
  {
    id: 'laugh',
    label: 'Need a good laugh.',
    sublabel: 'Sharp comedies, wit, and effortless warmth.',
    slug: 'comedy',
    accentColor: '#D9A45D',
    surfaceTint: 'linear-gradient(145deg, rgba(217,164,93,0.11) 0%, #17161D 100%)',
    Icon: Smile,
  },
  {
    id: 'mindbend',
    label: 'Something mind-bending.',
    sublabel: 'Surreal sci-fi, layered mysteries, and cinema that stays with you.',
    slug: 'mind-bending',
    accentColor: '#A68BC7',
    surfaceTint: 'linear-gradient(145deg, rgba(128,96,168,0.16) 0%, #17161D 100%)',
    Icon: Orbit,
  },
  {
    id: 'romance',
    label: 'A little romance.',
    sublabel: 'Intimate, human stories about connection and longing.',
    slug: 'romance',
    accentColor: '#C97B8E',
    surfaceTint: 'linear-gradient(145deg, rgba(201,123,142,0.11) 0%, #17161D 100%)',
    Icon: Heart,
  },
  {
    id: 'dark',
    label: 'Dark and mysterious.',
    sublabel: 'Atmospheric noir, crime, and slow-burn psychological intrigue.',
    slug: 'dark',
    accentColor: '#7B8FD1',
    surfaceTint: 'linear-gradient(145deg, rgba(123,143,209,0.11) 0%, #17161D 100%)',
    Icon: Moon,
  },
  {
    id: 'feelgood',
    label: 'Feel-good stories.',
    sublabel: 'Uplifting cinema with heart, resilience, and optimism.',
    slug: 'feel-good',
    accentColor: '#79B38A',
    surfaceTint: 'linear-gradient(145deg, rgba(121,179,138,0.11) 0%, #17161D 100%)',
    Icon: Sun,
  },
  {
    id: 'thriller',
    label: 'Edge-of-your-seat thrillers.',
    sublabel: 'Relentless tension, sharp turns, and high-stakes pacing.',
    slug: 'thriller',
    accentColor: '#D9A45D',
    surfaceTint: 'linear-gradient(145deg, rgba(217,164,93,0.10) 0%, #17161D 100%)',
    Icon: Zap,
  },
];

export function MoodDiscovery() {
  return (
    <section aria-labelledby="mood-heading">
      <Container>
        <SectionHeading
          id="mood-heading"
          overline="Discover by feeling"
          title="WHAT'S YOUR MOOD TONIGHT?"
          subtitle="Find a story that matches the way you feel."
          className="mb-7"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {MOODS.map((mood, index) => {
            const Icon = mood.Icon;
            return (
              <motion.div
                key={mood.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: index * 0.05, ease: EASE_OUT }}
                className="h-full"
              >
                <Link
                  href={`/discover?mood=${mood.slug}`}
                  className="group flex flex-col justify-between h-full min-h-[176px] p-6 rounded-2xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.16]"
                  style={{
                    background: mood.surfaceTint,
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  aria-label={`Explore mood: ${mood.label}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#101014]/75 border border-white/[0.08]"
                        style={{ color: mood.accentColor }}
                      >
                        <Icon size={18} strokeWidth={1.8} />
                      </div>
                      <ArrowUpRight
                        size={16}
                        className="text-[#77727F] group-hover:text-[#F5F2F7] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200"
                      />
                    </div>

                    <h3 className="text-lg font-semibold text-[#F5F2F7] leading-snug group-hover:text-white transition-colors">
                      {mood.label}
                    </h3>

                    <p className="mt-2 text-sm text-[#AAA5B3] leading-relaxed">
                      {mood.sublabel}
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                    <span
                      className="h-0.5 w-8 rounded-full transition-all duration-300 group-hover:w-14"
                      style={{ background: mood.accentColor }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium text-[#AAA5B3] group-hover:text-[#F5F2F7] transition-colors">
                      Browse mood
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
