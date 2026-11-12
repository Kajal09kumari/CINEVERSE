'use client';

/**
 * Assistant Page — MIRA AI Film Guide Landing
 *
 * Automatically opens the floating MIRA chat widget while providing a
 * full-page cinematic introduction with persistent Navbar and Footer.
 */

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, MessageSquare, Compass } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { useMiraWidget } from '@/context/MiraWidgetContext';

function AssistantContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const { openMira } = useMiraWidget();

  useEffect(() => {
    // Automatically open the floating widget on page load
    const timer = setTimeout(() => {
      openMira(query || undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [openMira, query]);

  return (
    <Container className="pt-28 pb-20 space-y-10">
      <div className="relative overflow-hidden rounded-2xl p-8 sm:p-12 bg-gradient-to-br from-[#17161D] to-[#1C1A23] border border-[#8060A8]/30 space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8060A8]/20 border border-[#8060A8]/40 text-xs font-semibold uppercase tracking-wider text-[#A68BC7]">
          <Sparkles size={13} />
          MIRA · Intelligent Conversational Concierge
        </div>

        <div className="space-y-3 max-w-2xl">
          <h1
            className="text-3xl sm:text-5xl font-semibold text-[#F5F2F7] leading-tight"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Meet MIRA, Your Personal Cinematic Companion
          </h1>
          <p className="text-sm sm:text-base text-[#AAA5B3] leading-relaxed">
            MIRA is active right now in the floating panel at the lower-right corner of your screen.
            Ask naturally, discover hidden gems across Watchmode and MovieLens, and get tailored streaming links.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={() => openMira()}
          >
            <MessageSquare size={16} />
            Open Floating Chat
          </Button>

          <Button href="/discover" variant="secondary" size="lg">
            <Compass size={16} />
            Browse Catalog
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-white/[0.08]">
          <div className="p-4 rounded-xl bg-[#101014]/60 border border-white/[0.06] space-y-1">
            <p className="text-xs font-semibold text-[#F5F2F7]">Persistent Memory</p>
            <p className="text-[11px] text-[#77727F]">
              Conversations persist in SQLite and refine over multiple turns.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#101014]/60 border border-white/[0.06] space-y-1">
            <p className="text-xs font-semibold text-[#F5F2F7]">Machine Learning Signals</p>
            <p className="text-[11px] text-[#77727F]">
              Blends MovieLens collaborative filtering with real user preferences.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#101014]/60 border border-white/[0.06] space-y-1">
            <p className="text-xs font-semibold text-[#F5F2F7]">Multi-Region Streaming</p>
            <p className="text-[11px] text-[#77727F]">
              Detects real streaming availability for IN, US, GB, CA, and AU.
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}

export default function AssistantPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#101014] text-[#F5F2F7] overflow-x-hidden">
      <Navbar />
      <main className="flex-1 min-w-0">
        <Suspense
          fallback={
            <Container className="pt-28 pb-20">
              <div className="h-72 rounded-2xl bg-[#17161D] border border-white/[0.08] animate-pulse" />
            </Container>
          }
        >
          <AssistantContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
