// Loading state for /admin/accept-invite — shown while the
// Suspense boundary hydrates useSearchParams().

import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading invite…
      </div>
    </div>
  );
}
