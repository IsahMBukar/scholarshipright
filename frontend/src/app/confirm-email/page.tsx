'use client';

// /confirm-email — email confirmation page.
//
// Flow:
//   1. User clicks confirmation link in email
//   2. Link contains ?token=...
//   3. We POST /api/auth/confirm-email with the token
//   4. On success → redirect to /onboarding (cookie already set from registration)
//   5. On error → show error message with resend option

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, CheckCircle2, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import Button from '@/components/admin/ui/Button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function ConfirmEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'already' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No confirmation token found. Please check your email link.');
      return;
    }

    async function confirm() {
      try {
        const res = await fetch(`${API_URL}/api/auth/confirm-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          if (data.status === 'already_confirmed') {
            setStatus('already');
            setEmail(data.email);
          } else {
            setStatus('success');
            setEmail(data.email);
          }
          // Auto-redirect to onboarding after 2 seconds
          setTimeout(() => router.push('/onboarding'), 2000);
        } else {
          setStatus('error');
          const detail = data.detail;
          if (typeof detail === 'object' && detail?.user_message) {
            setError(detail.user_message);
          } else if (typeof detail === 'string') {
            setError(detail);
          } else {
            setError('This confirmation link is invalid or has expired.');
          }
        }
      } catch {
        setStatus('error');
        setError('Connection failed. Please try again.');
      }
    }

    confirm();
  }, [token, router]);

  // Dev hint: if there's a token param, show it for debugging
  useEffect(() => {
    if (token && process.env.NODE_ENV === 'development') {
      setDevUrl(`${API_URL}/api/auth/confirm-email`);
    }
  }, [token]);

  // ── Success / Already confirmed ──
  if (status === 'success' || status === 'already') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                {status === 'already' ? 'Already confirmed' : 'Email confirmed!'}
              </h1>
              <p className="text-xs text-text-secondary">
                {status === 'already'
                  ? 'Your email was already confirmed.'
                  : 'Your email has been verified successfully.'}
              </p>
            </div>
          </div>

          {email && (
            <div className="flex items-center gap-3 rounded-btn border border-gray-200 bg-gray-50 p-4 mb-6">
              <Mail className="w-5 h-5 text-primary shrink-0" />
              <p className="text-sm font-medium text-text-primary">{email}</p>
            </div>
          )}

          <div className="space-y-3 text-sm text-text-secondary">
            <p>Redirecting you to onboarding in a moment…</p>
          </div>

          <div className="mt-6">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => router.push('/onboarding')}
            >
              Continue to onboarding
            </Button>
          </div>
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

          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Confirmation links expire in <span className="font-semibold text-text-primary">24 hours</span>.
              You can request a new one below.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full"
              onClick={async () => {
                if (email) {
                  await fetch(`${API_URL}/api/auth/resend-confirmation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                  });
                  alert('Confirmation email sent! Check your inbox.');
                } else {
                  router.push('/signup');
                }
              }}
            >
              {email ? 'Resend confirmation' : 'Go to signup'}
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <Link
              href="/login"
              className="text-text-secondary hover:text-text-primary"
            >
              Back to sign in
            </Link>
            <Link
              href="/signup"
              className="text-primary font-semibold hover:underline"
            >
              Create new account
            </Link>
          </div>
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
