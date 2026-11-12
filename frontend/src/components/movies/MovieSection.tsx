'use client';

/**
 * MovieSection — reusable grid-based movie section wrapper inside Container.
 */

import { motion } from 'framer-motion';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { MovieCard } from './MovieCard';
import type { Movie } from '@/types';

interface MovieSectionProps {
  id?: string;
  overline?: string;
  title: string;
  subtitle?: string;
  movies: Movie[];
  genreMap?: Record<number, string>;
  serifTitle?: boolean;
}

export function MovieSection({
  id,
  overline,
  title,
  subtitle,
  movies,
  genreMap,
  serifTitle = false,
}: MovieSectionProps) {
  if (movies.length === 0) return null;

  return (
    <section aria-labelledby={id}>
      <Container>
        <SectionHeading
          id={id}
          overline={overline}
          title={title}
          subtitle={subtitle}
          serif={serifTitle}
          className="mb-7"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 lg:gap-6">
          {movies.map((movie, index) => (
            <motion.div
              key={movie.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.4, delay: index * 0.06 }}
              className="h-full"
            >
              <MovieCard movie={movie} genreMap={genreMap} className="w-full" />
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
