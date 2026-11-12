/**
 * CINEVERSE Homepage
 *
 * Combines full-bleed cinematic Hero presentation with centered
 * 1440px content alignment, tightened section rhythm, and live Watchmode discovery.
 */

import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HomeDiscoveryClient } from '@/components/home/HomeDiscoveryClient';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#101014] text-[#F5F2F7] overflow-x-hidden">
      <Navbar />
      <HomeDiscoveryClient />
      <Footer />
    </div>
  );
}
