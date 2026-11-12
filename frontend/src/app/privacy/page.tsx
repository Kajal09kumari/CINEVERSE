import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#101014] text-[#F5F2F7]">
      <Navbar />
      <main className="flex-1">
        <Container className="pt-32 pb-20">
          <div className="max-w-2xl">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs text-[#AAA5B3] hover:text-[#F5F2F7] mb-8 transition-colors"
            >
              <ArrowLeft size={14} />
              Back to Home
            </Link>
            <h1
              className="text-3xl sm:text-4xl font-bold text-[#F5F2F7] mb-6"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              Privacy
            </h1>
            <p className="text-[#AAA5B3] leading-relaxed mb-4">
              CINEVERSE is an educational internship project. During the Day 2 UI
              preview, watchlist items added locally are stored only in your own
              browser&apos;s localStorage and are never transmitted to an external server.
            </p>
            <p className="text-[#AAA5B3] leading-relaxed">
              Title metadata, posters, and regional streaming availability are
              powered by Watchmode.com and cached responsibly on the CINEVERSE backend.
            </p>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
