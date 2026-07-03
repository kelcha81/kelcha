'use client';

import { useEffect } from 'react';

// Route-level error boundary: a render/effect throw anywhere in the app tree
// lands here instead of white-screening the session. State (Firestore/IndexedDB)
// is untouched, so "Try again" usually recovers in place.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f14] p-6 text-slate-100">
      <div className="w-[420px] max-w-full rounded-lg border border-slate-700 bg-slate-900 p-5 text-center">
        <div className="text-lg font-semibold">Something went wrong</div>
        <p className="mt-2 text-sm text-slate-400">
          The app hit an unexpected error. Your sessions, trades and drawings are safe.
        </p>
        {error?.message && (
          <pre className="mt-3 max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-left text-[11px] text-red-300">
            {error.message}
          </pre>
        )}
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="rounded border border-slate-700 bg-slate-800 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            Reload app
          </button>
        </div>
      </div>
    </main>
  );
}
