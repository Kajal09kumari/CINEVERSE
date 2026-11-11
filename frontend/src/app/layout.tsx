import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

/**
 * Inter is used for its excellent readability at all sizes and
 * its cinematic, editorial feel — appropriate for CINEVERSE.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'CINEVERSE — Discover Beyond the Ordinary',
    template: '%s | CINEVERSE',
  },
  description:
    'An intelligent movie discovery platform powered by AI. Find films that match your taste, guided by MIRA.',
  keywords: ['movies', 'recommendations', 'AI', 'film discovery', 'MIRA'],
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
