'use client';

// app/error.tsx — Error boundary for main user-facing pages.

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '@/components/admin/ui/Button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Something went wrong</h1>
            <p className="text-xs text-text-secondary">
              An unexpected error occurred. Please try again.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          className="w-full"
          onClick={reset}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
