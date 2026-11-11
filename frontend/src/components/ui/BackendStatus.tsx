'use client';

/**
 * BackendStatus Component
 *
 * Displays the connection state between the Next.js frontend
 * and the FastAPI backend. Shows three states:
 * - Loading: checking...
 * - Connected: healthy response received
 * - Failed: backend unreachable or returned an error
 *
 * This is a Day 1 verification component. It will be removed
 * from the homepage once real content is built.
 */

import { useEffect, useState } from 'react';
import { checkBackendHealth } from '@/services/api';

type ConnectionState = 'checking' | 'connected' | 'failed';

export function BackendStatus() {
  const [state, setState] = useState<ConnectionState>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        await checkBackendHealth();
        if (!cancelled) setState('connected');
      } catch (err) {
        if (!cancelled) {
          setState('failed');
          setErrorMessage(
            err instanceof Error ? err.message : 'Unknown error'
          );
        }
      }
    }

    check();

    // Cleanup: if the component unmounts before the request finishes,
    // don't update state on the now-unmounted component.
    return () => {
      cancelled = true;
    };
  }, []);

  const stateConfig = {
    checking: {
      dot: 'bg-amber-400 animate-pulse',
      label: 'Checking backend...',
      sub: 'Attempting to reach the CINEVERSE API',
    },
    connected: {
      dot: 'bg-emerald-400',
      label: 'Backend connected',
      sub: 'CINEVERSE API is healthy and responding',
    },
    failed: {
      dot: 'bg-red-400',
      label: 'Backend connection failed',
      sub: errorMessage ?? 'Could not reach the CINEVERSE API',
    },
  };

  const config = stateConfig[state];

  return (
    <div
      className="flex flex-col items-center gap-3 px-6 py-5 rounded-xl border"
      style={{
        background: 'var(--color-bg-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {config.label}
        </span>
      </div>
      <p
        className="text-xs text-center max-w-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {config.sub}
      </p>
    </div>
  );
}
