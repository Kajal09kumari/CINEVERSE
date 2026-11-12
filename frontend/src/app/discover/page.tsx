import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';
import { MovieCardSkeleton } from '@/components/ui/LoadingState';
import { DiscoverClient } from '@/components/discover/DiscoverClient';

export const metadata: Metadata = {
  title: 'Discover',
  description:
    'Search and filter movies, TV series, and documentaries powered by Watchmode across genre, language, release year, rating, and popularity.',
};

export default function DiscoverPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#101014] text-[#F5F2F7] overflow-x-hidden">
      <Navbar />
      <main className="flex-1 min-w-0">
        <Suspense
          fallback={
            <Container className="pt-28 pb-20">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 pt-16">
                {Array.from({ length: 10 }).map((_, i) => (
                  <MovieCardSkeleton key={i} />
                ))}
              </div>
            </Container>
          }
        >
          <DiscoverClient />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
