'use client';

// Root error boundary. Catches errors in the root layout itself.
// Renders a full-screen fallback because we can't rely on the layout
// (e.g. the QueryProvider is broken).

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for now. Wire to Sentry/Datadog in a later phase.
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            fontFamily: 'system-ui, sans-serif',
            background: '#f3f4f6',
            color: '#111827',
          }}
        >
          <div
            style={{
              maxWidth: '28rem',
              width: '100%',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '24px',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '9999px',
                background: '#fef2f2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
                fontSize: '1.25rem',
                fontWeight: 600,
              }}
            >
              !
            </div>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1rem' }}>
              The app encountered an unexpected error. Reload to continue.
            </p>
            {error.digest && (
              <p
                style={{
                  fontSize: '0.6875rem',
                  color: '#9ca3af',
                  fontFamily: 'monospace',
                  margin: '0 0 1rem',
                }}
              >
                Reference: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                height: '2.5rem',
                padding: '0 1.25rem',
                borderRadius: '9999px',
                background: '#f5b942',
                color: 'white',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
