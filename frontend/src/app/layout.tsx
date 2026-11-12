import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { MiraWidgetProvider } from '@/context/MiraWidgetContext';
import { MiraFloatingWidget } from '@/components/assistant/MiraFloatingWidget';
import './globals.css';

/**
 * Inter — the primary UI font.
 * Used for navigation, body text, labels, and all interactive elements.
 * Excellent legibility at every size.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});

/**
 * Playfair Display — the editorial display font.
 * Used selectively for section headings and the hero title to give
 * CINEVERSE its cinematic, magazine-quality character.
 * Keep usage restrained — not every heading needs this font.
 */
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: {
    default: 'CINEVERSE — Discover Beyond the Ordinary',
    template: '%s | CINEVERSE',
  },
  description:
    'An intelligent movie discovery platform powered by AI. Find films that match your taste, guided by MIRA.',
  keywords: ['movies', 'recommendations', 'AI', 'film discovery', 'MIRA'],
  openGraph: {
    title: 'CINEVERSE — Discover Beyond the Ordinary',
    description:
      'Personalised movie recommendations powered by machine learning and MIRA, your AI film guide.',
    type: 'website',
  },
};


interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen antialiased bg-[#101014] text-[#F5F2F7]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#7c6fcd] focus:text-white focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <MiraWidgetProvider>
          {children}
          <MiraFloatingWidget />
        </MiraWidgetProvider>
      </body>
    </html>
  );
}
