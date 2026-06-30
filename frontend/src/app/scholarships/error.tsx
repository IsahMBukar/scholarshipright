'use client';

// Error boundary scoped to /scholarships — prevents a flaky API
// call or render exception from blowing up the whole app shell.

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ScholarshipsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ScholarshipsError]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Scholarships couldn’t load
            </h2>
            <p className="text-xs text-text-secondary">
              An unexpected error occurred. Try again, or refresh the page.
            </p>
          </div>
        </div>
        {error.digest && (
          <p className="text-[11px] text-text-secondary font-mono mb-4 break-all">
            ref: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-btn bg-primary text-white text-sm font-medium hover:opacity-90 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
