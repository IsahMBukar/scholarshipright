// Shared auth helpers used by logout buttons across the app.
// Calls /api/auth/logout (clears the sr_token cookie) and bounces
// the user back to the public login page.
//
// On logout we also wipe the user's onboarding localStorage keys
// (slide index, manual-source flag, chat flag, plus any legacy
// unscoped keys from the pre-per-user-scoping design) so a fresh
// signup on the same browser doesn't inherit stale state. We do
// this BEFORE redirecting, while we still have the user id in hand.

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { clearOnboardingForUser } from '@/hooks/useOnboarding';
import { fetchMe } from '@/services/api';

import { API_URL } from '@/lib/env';

export function useLogout() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(
    async (redirectTo: string = '/login') => {
      setLoggingOut(true);
      setError(null);
      try {
        // Best-effort cookie clear; even if the request fails we still
        // bounce the user away from the authenticated app.
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        }).catch(() => {
          /* network errors don't matter — we redirect anyway */
        });

        // Wipe per-user onboarding state (slide index, manual-source
        // flag, chat flag) and any legacy unscoped keys. We do this
        // BEFORE the redirect, while we still know the user id.
        try {
          const me = await fetchMe().catch(() => null);
          const userId = me?.id ? String(me.id) : null;
          clearOnboardingForUser(userId);
        } catch {
          /* if /me fails, we still wipe the legacy unscoped keys */
          clearOnboardingForUser(null);
        }
      } finally {
        setLoggingOut(false);
        // Force a full reload so React Query / SWR / Zustand stores reset
        // and the admin layout re-checks /api/auth/me (which will 401).
        if (typeof window !== 'undefined') {
          window.location.href = redirectTo;
        } else {
          router.push(redirectTo);
        }
      }
    },
    [router]
  );

  return { logout, loggingOut, error };
}

// Lightweight one-shot helper for places that don't need hook state
// (e.g. inline <a> handlers in nav menus).
export async function logoutAndRedirect(redirectTo: string = '/login') {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* ignore */
  }
  try {
    const me = await fetchMe().catch(() => null);
    const userId = me?.id ? String(me.id) : null;
    clearOnboardingForUser(userId);
  } catch {
    clearOnboardingForUser(null);
  }
  if (typeof window !== 'undefined') {
    window.location.href = redirectTo;
  }
}
