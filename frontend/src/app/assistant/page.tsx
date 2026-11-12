import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles, ArrowLeft, Compass } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'MIRA — Your AI Film Guide' };

interface AssistantPageProps {
  searchParams: Promise<{ q?: string }>;
}

async function AssistantContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <Container className="py-12">
      <div className="max-w-xl mx-auto rounded-2xl bg-[#17161D] border border-white/[0.08] p-8 sm:p-10 text-center flex flex-col items-center gap-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: 'rgba(128,96,168,0.2)',
            border: '1px solid rgba(128,96,168,0.4)',
          }}
        >
          <Sparkles size={26} className="text-[#A68BC7]" />
        </div>

        <div className="space-y-3">
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-[#A68BC7] block">
            Planned for Day 5
          </span>
          <h1
            className="text-3xl sm:text-4xl font-semibold text-[#F5F2F7] leading-tight"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            MIRA Assistant
          </h1>
          <p className="text-sm sm:text-base text-[#AAA5B3] leading-relaxed max-w-md mx-auto">
            MIRA — your Movie Intelligence &amp; Recommendation Assistant — is
            currently in development. Conversational movie discovery will
            connect to the recommendation engine in a later phase.
          </p>
        </div>

        {q && (
          <div className="w-full px-4 py-3.5 rounded-xl bg-[#101014]/70 border border-white/[0.08] text-xs sm:text-sm text-[#AAA5B3]">
            Selected prompt:{' '}
            <span className="text-[#F5F2F7] font-medium">&ldquo;{q}&rdquo;</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button href="/discover" variant="primary" size="md">
            <Compass size={16} />
            Explore Discover
          </Button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-[#AAA5B3] hover:text-[#F5F2F7] border border-white/[0.08] hover:border-white/[0.16] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Home
          </Link>
        </div>
      </div>
    </Container>
  );
}

export default function AssistantPage({ searchParams }: AssistantPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#101014] text-[#F5F2F7]">
      <Navbar />
      <main className="flex-1 flex items-center justify-center pt-[76px]">
        <Suspense
          fallback={
            <Container className="py-12 text-center text-sm text-[#77727F]">
              Loading MIRA preview...
            </Container>
          }
        >
          <AssistantContent searchParams={searchParams} />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
