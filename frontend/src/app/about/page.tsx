import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Container } from '@/components/ui/Container';

export const metadata: Metadata = { title: 'About CINEVERSE' };

export default function AboutPage() {
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
              About CINEVERSE
            </h1>
            <p className="text-[#AAA5B3] leading-relaxed mb-4">
              CINEVERSE is an intelligent movie discovery and recommendation platform
              developed as a college internship project. It combines content-based
              filtering, collaborative filtering, and a conversational assistant
              (MIRA) to surface films aligned with individual taste.
            </p>
            <p className="text-[#AAA5B3] leading-relaxed">
              Built with Next.js, TypeScript, Tailwind CSS, FastAPI, Python, and
              scikit-learn.
            </p>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
