'use client';
import { useEffect } from 'react';

export default function AdminInvitesError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error('[AdminInvitesError]', error); }, [error]);
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl mb-4">⚠️</p>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-500 mb-4">An unexpected error occurred.</p>
        <button onClick={reset} className="px-4 py-2 rounded-full text-sm font-medium bg-[#1a1a1a] text-white hover:bg-[#333]">Try again</button>
      </div>
    </div>
  );
}
