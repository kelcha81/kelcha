'use client';

// Last-resort boundary: catches errors thrown by the root layout itself.
// Must render its own <html>/<body> because the layout is gone at this point.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#0b0f14', color: '#e2e8f0', fontFamily: 'sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h2>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>{error?.message || 'Unexpected error.'}</p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 16,
                background: '#2563eb',
                color: '#fff',
                border: 0,
                borderRadius: 4,
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer'
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
