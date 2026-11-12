'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('CINEVERSE route error boundary:', error.message);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-24">
      <div
        className="max-w-md w-full rounded-2xl border p-8 text-center space-y-5"
        style={{
          background: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div
          className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: 'rgba(212, 145, 58, 0.14)',
            color: 'var(--color-accent-amber)',
          }}
        >
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-[#f0eee8]">
            Something went off-script
          </h1>
          <p className="text-sm text-[#9e9ba5] leading-relaxed">
            An unexpected UI error occurred while rendering this view. Your
            watchlist and Taste DNA remain safely saved.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
            style={{ background: 'var(--color-accent-violet)' }}
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-[#252530] text-[#f0eee8] hover:border-[#7c6fcd] transition-colors"
          >
            <Home className="w-4 h-4" />
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}
