'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function BlogDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[BlogDetailError]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#f0ebe0] p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#1a1a1a]">
              Blog post couldn&apos;t load
            </h2>
            <p className="text-xs text-gray-500">
              An unexpected error occurred. Try again, or go back to the blog.
            </p>
          </div>
        </div>
        {error.digest && (
          <p className="text-[11px] text-gray-400 font-mono mb-4 break-all">
            ref: {error.digest}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[#1a1a1a] text-white text-sm font-medium hover:opacity-90 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/blog"
            className="inline-flex items-center h-10 px-5 rounded-full border border-[#f0ebe0] text-sm font-medium text-gray-600 hover:border-[#f5b942]/40 transition"
          >
            Back to blog
          </Link>
        </div>
      </div>
    </div>
  );
}
