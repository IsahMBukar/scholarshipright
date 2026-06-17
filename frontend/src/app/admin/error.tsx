'use client';

// Error boundary for the /admin segment. Catches errors thrown by any
// admin page (e.g. a useQuery throws unexpectedly, a render explodes)
// and shows a recovery UI scoped to the admin shell.
//
// Note: this file lives at src/app/admin/error.tsx. It does NOT cover
// global errors — see app/global-error.tsx for that.

import { useEffect } from 'react';
import { AlertOctagon, RotateCw } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AdminError]', error);
  }, [error]);

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertOctagon className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">
          Admin page crashed
        </h2>
        <p className="text-sm text-text-secondary mb-1">
          An unexpected error occurred while loading this page.
        </p>
        {error.digest && (
          <p className="text-xs text-text-secondary font-mono mb-4">
            ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-btn bg-primary text-white text-sm font-medium hover:opacity-90 transition"
        >
          <RotateCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
