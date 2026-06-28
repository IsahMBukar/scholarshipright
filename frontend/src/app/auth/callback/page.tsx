'use client';

// /auth/callback — receives the redirect from backend after Google OAuth.
// The backend has already set the JWT cookie. This page:
//   1. Calls refresh() to pick up the auth state
//   2. Checks if user has a profile → /onboarding or /scholarships
//   3. Replays any pending action if one was set before OAuth

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { refresh, pendingAction, setPendingAction } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        // Refresh auth state — the cookie was set by the backend redirect
        await refresh();

        // If there's a pending action (from AuthModal), replay it
        if (pendingAction) {
          const action = pendingAction;
          setPendingAction(null);
          action.onReplay?.();
          router.push('/scholarships');
          return;
        }

        // Check if user has a profile
        const profileRes = await fetch(`${API_URL}/api/profile`, {
          credentials: 'include',
        });

        if (cancelled) return;

        if (profileRes.status === 404) {
          router.push('/onboarding');
        } else {
          router.push('/scholarships');
        }
      } catch {
        if (!cancelled) {
          setError('Something went wrong. Please try signing in again.');
        }
      }
    }

    handleCallback();
    return () => { cancelled = true; };
  }, [router, refresh, pendingAction, setPendingAction]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8 text-center">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-btn hover:brightness-110 transition-all"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span>Signing you in…</span>
      </div>
    </div>
  );
}
