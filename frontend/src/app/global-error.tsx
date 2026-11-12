'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          backgroundColor: '#0d0d0f',
          color: '#f0eee8',
          fontFamily: 'system-ui, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '420px',
            width: '100%',
            background: '#111115',
            border: '1px solid #252530',
            borderRadius: '16px',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '10px' }}>
            CINEVERSE encountered a critical error
          </h1>
          <p style={{ fontSize: '14px', color: '#9e9ba5', marginBottom: '20px' }}>
            Please reload the application to restore your session.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#7c6fcd',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 18px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload CINEVERSE
          </button>
        </div>
      </body>
    </html>
  );
}
