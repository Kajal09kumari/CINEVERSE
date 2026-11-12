import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';
import { Skeleton } from '@/components/ui/LoadingState';
import { MovieDetailClient } from '@/components/movies/MovieDetailClient';

export const metadata: Metadata = { title: 'Movie Details' };

interface Props {
  params: Promise<{ id: string }>;
}

async function MovieDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  return <MovieDetailClient movieId={numericId} />;
}

export default function MovieDetailPage({ params }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-[#101014] text-[#F5F2F7] overflow-x-hidden">
      <Navbar />
      <main className="flex-1 min-w-0">
        <Suspense
          fallback={
            <Container className="pt-28 pb-16">
              <Skeleton className="h-72 w-full rounded-2xl" />
            </Container>
          }
        >
          <MovieDetailContent params={params} />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
