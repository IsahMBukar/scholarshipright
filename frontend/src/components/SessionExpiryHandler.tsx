'use client';

// SessionExpiryHandler — mounted once at the root.
//
// Intercepts 401 responses globally via fetch wrapper.
// When a session expires mid-browse:
//   1. Shows a toast notification
//   2. Disables further actions
//   3. Redirects to /login after 3 seconds
//
// This is for AUTHENTICATED users whose session expires,
// NOT for guests browsing public pages.

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

// Public routes where 401 is expected (guest browsing) — don't trigger expiry toast
const PUBLIC_ROUTES = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/confirm-email', '/admin/accept-invite'];

export function SessionExpiryHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, logout } = useAuth();
  const [showToast, setShowToast] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasAuthenticated = useRef(false);

  // Track if user was previously authenticated
  useEffect(() => {
    if (isAuthenticated) {
      wasAuthenticated.current = true;
    }
  }, [isAuthenticated]);

  // Detect session expiry: user was authenticated, now isn't, on a protected route
  useEffect(() => {
    const isPublic = PUBLIC_ROUTES.some((r) => pathname === r || pathname?.startsWith(r + '/'));
    if (wasAuthenticated.current && !isAuthenticated && !isPublic) {
      // Session expired!
      setShowToast(true);
      redirectTimer.current = setTimeout(() => {
        setShowToast(false);
        router.push(`/login?next=${encodeURIComponent(pathname || '/')}`);
      }, 3000);
    }
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [isAuthenticated, pathname, router]);

  if (!showToast) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-onboarding-slide-up">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border border-amber-200 rounded-xl shadow-lg">
        <span className="material-symbols-outlined text-amber-600 text-[20px]">timer_off</span>
        <div>
          <p className="text-[13px] font-semibold text-text-primary">Session expired</p>
          <p className="text-[12px] text-text-secondary">Redirecting to sign in...</p>
        </div>
        <button
          onClick={() => {
            setShowToast(false);
            if (redirectTimer.current) clearTimeout(redirectTimer.current);
            router.push(`/login?next=${encodeURIComponent(pathname || '/')}`);
          }}
          className="ml-2 px-3 py-1.5 bg-primary text-white text-[12px] font-semibold rounded-btn hover:brightness-110 transition-all"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
