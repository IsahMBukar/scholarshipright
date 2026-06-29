'use client';

// /login — public sign-in page.
//
// Visual DNA is shared with /signup and /admin/accept-invite so all three
// auth surfaces look and feel identical:
//   - Same `min-h-screen flex items-center justify-center p-6 bg-gray-100`
//     page layout
//   - Same `max-w-md w-full bg-white rounded-card border border-gray-200 p-8`
//     card (no shadow-sm — accept-invite is the source of truth)
//   - Same in-card icon+title+subtitle header (LogIn icon, gray-100 circle)
//   - Same small subtle labels (`text-xs font-medium text-text-secondary`)
//   - Same white-on-gray-200 input style (40px tall, rounded-btn, small text)
//   - Same red-pill error display with AlertTriangle icon
//   - Same `Button` from @/components/admin/ui/Button
//   - Same `PasswordField` from @/components/auth/PasswordField
//     (gives login the eye toggle too — small but nice-to-have)
//
// Behavior:
//   - `?next=` is honored if present, but only internal paths (no
//     open-redirect).
//   - On success with no `?next=`, redirect to /onboarding if the user
//     has no profile, else /scholarships.
//   - Dev login button is preserved (it's still a real dev affordance) but
//     restyled to use the `Button` secondary variant.

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogIn, AlertTriangle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import Button from '@/components/admin/ui/Button';
import PasswordField from '@/components/auth/PasswordField';
import GoogleButton from '@/components/auth/GoogleButton';
import { useAuth } from '@/hooks/useAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


// Only allow internal paths as the ?next= target. Block absolute URLs and
// protocol-relative ones to prevent open-redirect via crafted query.
function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get('next'), '/scholarships');
  const { pendingAction, setPendingAction, refresh } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);
  // Banners driven by query params:
  //   ?reset=success  → password was just reset
  //   ?signup=ok      → account was just created (existing)
  //   ?error=...      → Google OAuth error
  // ?next= is honored if present (see safeNext).
  const justReset = searchParams.get('reset') === 'success';
  const justSignedUp = searchParams.get('signup') === 'ok';
  const oauthError = searchParams.get('error');

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then((r) => {
        if (!cancelled && r.ok) router.push(nextPath);
      })
      .catch(() => {
        /* not logged in — fall through to the form */
      });
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) {
        // Refresh auth state
        await refresh();

        // If there's a pending action (from action gating), replay it
        if (pendingAction) {
          const action = pendingAction;
          setPendingAction(null);
          action.onReplay?.();
          // Navigate to the next path (or stay on current page if no next)
          if (searchParams.get('next')) {
            router.push(nextPath);
          } else {
            router.push('/scholarships');
          }
          return;
        }

        // If a `?next` was passed (e.g. /admin), honor it. Otherwise
        // walk through onboarding if the user has no profile.
        if (searchParams.get('next')) {
          router.push(nextPath);
          return;
        }
        try {
          const profileRes = await fetch(`${API_URL}/api/profile`, {
            credentials: 'include',
          });
          if (profileRes.status === 404) {
            router.push('/onboarding');
          } else {
            router.push('/scholarships');
          }
        } catch {
          router.push('/scholarships');
        }
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
      const detail = data.detail;

      // Check for email_not_confirmed (403)
      if (res.status === 403 && detail && typeof detail === 'object' && 'code' in detail) {
        const d = detail as { code?: string; email?: string };
        if (d.code === 'email_not_confirmed') {
          setUnconfirmedEmail(d.email || email.trim());
          return;
        }
      }

      if (typeof detail === 'string') {
        setError(detail);
      } else if (detail && typeof detail === 'object' && 'user_message' in detail) {
        setError(String((detail as { user_message?: string }).user_message));
      } else {
        setError('Invalid email or password');
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }


  // ── Email not confirmed dialog ──
  if (unconfirmedEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
              <Mail className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Confirm your email</h1>
              <p className="text-xs text-text-secondary">
                Please verify your email address before signing in.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-btn border border-gray-200 bg-gray-50 p-4 mb-6">
            <Mail className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-text-primary">{unconfirmedEmail}</p>
              <p className="text-[11px] text-text-secondary mt-0.5">
                We sent a confirmation link to this address.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              Check your inbox and click the confirmation link.
              The link expires in <span className="font-semibold text-text-primary">24 hours</span>.
            </p>
          </div>

          {resendSent && (
            <div className="flex items-start gap-2 rounded-btn border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 mt-4">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Confirmation email sent! Check your inbox.</span>
            </div>
          )}

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full"
              disabled={resendSent}
              onClick={async () => {
                setResendSent(false);
                await fetch(`${API_URL}/api/auth/resend-confirmation`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: unconfirmedEmail }),
                });
                setResendSent(true);
              }}
            >
              {resendSent ? 'Email sent ✓' : 'Resend confirmation email'}
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setUnconfirmedEmail(null);
                setError(null);
              }}
              className="text-text-secondary hover:text-text-primary"
            >
              ← Back to sign in
            </button>
            <Link
              href="/signup"
              className="text-primary-readable font-semibold hover:underline"
            >
              Use a different email
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <LogIn className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Welcome back</h1>
            <p className="text-xs text-text-secondary">Sign in to your account</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <GoogleButton />

          <div className="relative flex items-center justify-center my-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <span className="relative bg-white px-3 text-[11px] font-medium text-text-secondary uppercase tracking-wider">
              or
            </span>
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-text-secondary mb-1"
            >
              Email
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={submitting}
              required
              className="w-full h-10 px-3 rounded-btn border border-gray-200 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="Your password"
            autoComplete="current-password"
            disabled={submitting}
          />
          <div className="flex justify-end -mt-2">
            <Link
              href="/forgot-password"
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {(justReset || justSignedUp) && !error && !oauthError && (
            <div className="flex items-start gap-2 rounded-btn border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                {justReset
                  ? 'Your password has been updated. Sign in with your new password.'
                  : 'Account created. Sign in to continue.'}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-btn border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {oauthError && (
            <div className="flex items-start gap-2 rounded-btn border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                {oauthError === 'google_denied'
                  ? 'Google sign-in was cancelled. Please try again.'
                  : oauthError === 'google_no_email'
                  ? 'Could not get your email from Google. Please use email sign-in.'
                  : 'Google sign-in failed. Please try again.'}
              </span>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={!canSubmit}
            className="w-full"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-[11px] text-text-secondary text-center mt-4">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="text-primary-readable hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-primary-readable hover:underline">Privacy Policy</Link>.
        </p>

        <p className="text-[11px] text-text-secondary text-center mt-3">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary-readable font-semibold hover:underline">
            Sign up
          </Link>
        </p>


      </div>
    </div>
  );
}

export default function LoginPage() {
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
      <LoginForm />
    </Suspense>
  );
}
