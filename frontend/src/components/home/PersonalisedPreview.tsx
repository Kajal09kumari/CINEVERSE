'use client';

/**
 * PersonalisedPreview — "Picked for Your Taste." section inside Container.
 */

import { motion } from 'framer-motion';
import { Info, Sparkles } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { MovieCard } from '@/components/movies/MovieCard';
import { Button } from '@/components/ui/Button';
import { SAMPLE_PICKS } from '@/lib/fixtures';

export function PersonalisedPreview() {
  return (
    <section aria-labelledby="personalised-heading">
      <Container>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <SectionHeading
            id="personalised-heading"
            overline="Taste preview"
            title="Picked for Your Taste."
            subtitle="Your next favourite story might be closer than you think."
            serif
          />
          <Button href="/assistant" variant="ghost" size="sm">
            <Sparkles size={14} />
            Explore MIRA
          </Button>
        </div>

        {/* Explicit sample disclosure */}
        <div
          className="flex items-start gap-3 p-4 rounded-xl mb-7 bg-[#17161D] border border-white/[0.08]"
          role="note"
          aria-label="Sample preview notice"
        >
          <Info size={16} className="text-[#A68BC7] mt-0.5 flex-shrink-0" />
          <p className="text-xs sm:text-sm text-[#AAA5B3] leading-relaxed">
            <strong className="text-[#F5F2F7] font-medium">Sample selections</strong>{' '}
            — these titles are static preview examples. Recommendations become
            personalised as you rate films, save to your watchlist, and interact
            with CINEVERSE once our ML recommendation engine is connected.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 lg:gap-6">
          {SAMPLE_PICKS.map((movie, index) => (
            <motion.div
              key={movie.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.4, delay: index * 0.06 }}
              className="h-full"
            >
              <MovieCard
                movie={{ ...movie, genre_ids: [] }}
                className="w-full"
              />
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
