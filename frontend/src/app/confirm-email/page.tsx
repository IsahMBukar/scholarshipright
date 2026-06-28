'use client';

// /confirm-email — email confirmation page.
//
// Flow:
//   1. User clicks confirmation link in email → /confirm-email?token=...
//   2. We POST /api/auth/confirm-email with the token
//   3. Backend confirms email + sets auth cookie (auto-login)
//   4. Redirect to /onboarding

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import Button from '@/components/admin/ui/Button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function ConfirmEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No confirmation token found. Please check your email link.');
      return;
    }

    let cancelled = false;

    async function confirm() {
      try {
        const res = await fetch(`${API_URL}/api/auth/confirm-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        if (cancelled) return;

        if (res.ok) {
          setStatus('success');
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus('error');
          const detail = data.detail;
          if (typeof detail === 'object' && detail?.user_message) {
            setError(detail.user_message);
          } else {
            setError('This confirmation link is invalid or has expired.');
          }
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          setError('Connection failed. Please try again.');
        }
      }
    }

    confirm();
    return () => { cancelled = true; };
  }, [token, router]);

  // ── Success ──
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Email confirmed!</h1>
              <p className="text-xs text-text-secondary">
                Your email has been verified. Click below to continue.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => router.push('/onboarding')}
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Confirmation failed</h1>
              <p className="text-xs text-text-secondary">
                {error || 'This link is invalid or has expired.'}
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-text-secondary mb-6">
            <p>
              Confirmation links expire in <span className="font-semibold text-text-primary">24 hours</span>.
              You can request a new one from the sign up page.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => router.push('/signup')}
          >
            Go to sign up
          </Button>

          <p className="text-[11px] text-text-secondary text-center mt-4">
            Already confirmed?{' '}
            <Link href="/login" className="text-primary-readable font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ──
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-text-primary">Confirming your email…</h1>
            <p className="text-xs text-text-secondary mt-1">This will only take a moment.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        </div>
      }
    >
      <ConfirmEmailForm />
    </Suspense>
  );
}
