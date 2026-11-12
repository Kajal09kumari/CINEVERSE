import type { Metadata } from 'next';
import Link from 'next/link';
import { User, ArrowLeft } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';

export const metadata: Metadata = { title: 'Profile' };

export default function ProfilePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#101014] text-[#F5F2F7]">
      <Navbar />
      <main className="flex-1 flex items-center justify-center pt-[76px]">
        <Container className="py-12">
          <div className="max-w-lg mx-auto rounded-2xl bg-[#17161D] border border-white/[0.08] p-8 sm:p-10 text-center flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#1C1A23] border border-white/[0.08] flex items-center justify-center">
              <User size={24} className="text-[#A68BC7]" />
            </div>
            <h1
              className="text-3xl font-semibold text-[#F5F2F7]"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              Profile &amp; Taste DNA
            </h1>
            <p className="text-sm text-[#AAA5B3] leading-relaxed">
              User authentication via Supabase and personalised Taste DNA profiles will be introduced in the upcoming backend &amp; database phases.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs text-[#A68BC7] hover:underline mt-2"
            >
              <ArrowLeft size={14} />
              Back to Home
            </Link>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
