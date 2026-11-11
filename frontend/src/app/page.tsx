/**
 * CINEVERSE Home Page (Day 1 Placeholder)
 *
 * This is a minimal entry point that shows the backend connection status.
 * The full cinematic homepage will be built in a later phase.
 */

import { BackendStatus } from '@/components/ui/BackendStatus';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-3">
        <h1
          className="text-4xl font-bold tracking-widest"
          style={{ color: 'var(--color-text-primary)' }}
        >
          CINEVERSE
        </h1>
        <p
          className="text-sm tracking-[0.3em] uppercase"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Discover Beyond the Ordinary
        </p>
      </div>

      <BackendStatus />
    </main>
  );
}
