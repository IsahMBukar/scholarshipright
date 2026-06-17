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
import { LogIn, AlertTriangle, CheckCircle2, Loader2, Zap } from 'lucide-react';
import Button from '@/components/admin/ui/Button';
import PasswordField from '@/components/auth/PasswordField';

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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Banners driven by query params:
  //   ?reset=success  → password was just reset
  //   ?signup=ok      → account was just created (existing)
  // ?next= is honored if present (see safeNext).
  const justReset = searchParams.get('reset') === 'success';
  const justSignedUp = searchParams.get('signup') === 'ok';

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

  async function handleDevLogin() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/dev-login`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) router.push(nextPath);
      else setError('Dev login failed');
    } catch {
      setError('Connection failed.');
    } finally {
      setSubmitting(false);
    }
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

          {(justReset || justSignedUp) && !error && (
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
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary font-semibold hover:underline">
            Sign up
          </Link>
        </p>

        <div className="flex items-center gap-4 my-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[11px] text-text-secondary">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <Button
          type="button"
          variant="secondary"
          size="md"
          loading={submitting}
          onClick={handleDevLogin}
          leftIcon={<Zap className="w-3.5 h-3.5" />}
          className="w-full"
        >
          Quick dev login
        </Button>
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
