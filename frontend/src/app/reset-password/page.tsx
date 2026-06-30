'use client';

// /reset-password?token=xxx — consume a password-reset token and set a
// new password.
//
// Flow:
//   1. User clicks the link in their email (or in dev mode, the link
//      rendered on /forgot-password).
//   2. We extract `token` from the URL. If missing → render an
//      "invalid link" error state with a "request a new one" CTA.
//   3. User enters new password + confirm. Strength meter from
//      PasswordField gives feedback.
//   4. POST /api/auth/reset-password with {token, new_password}.
//   5. On 200: show a success state and auto-redirect to /login
//      after 3 seconds (or let the user click "Continue" first).
//   6. On 400 with `code` in the detail: render a specific
//      human-readable error ("expired", "already used", etc).
//
// Visual DNA matches /login, /signup, /forgot-password, and
// /admin/accept-invite.

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, AlertTriangle, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import Button from '@/components/admin/ui/Button';
import PasswordField from '@/components/auth/PasswordField';

import { API_URL } from '@/lib/env';
const AUTO_REDIRECT_MS = 3000;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Set to a future timestamp on success. We use the `now` ticker to
  // re-render the countdown label.
  const [redirectAt, setRedirectAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const noToken = !token.trim();

  // Single ticker — runs while redirectAt is set. Cheaper than
  // re-rendering every 250ms when not needed.
  useEffect(() => {
    if (redirectAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [redirectAt]);

  // Auto-redirect once the countdown hits zero.
  useEffect(() => {
    if (redirectAt === null) return;
    if (now >= redirectAt) {
      router.push('/login?reset=success');
    }
  }, [now, redirectAt, router]);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const passwordLongEnough = newPassword.length >= 8;
  const canSubmit =
    !noToken && passwordLongEnough && passwordsMatch && !submitting;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      if (res.ok) {
        setSuccess(true);
        setRedirectAt(Date.now() + AUTO_REDIRECT_MS);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        detail?: unknown;
      };
      const detail = data.detail;
      if (detail && typeof detail === 'object' && 'user_message' in detail) {
        setError(String((detail as { user_message?: string }).user_message));
      } else if (typeof detail === 'string') {
        setError(detail);
      } else {
        setError('Could not reset password. Please try again.');
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (noToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Invalid reset link</h1>
              <p className="text-xs text-text-secondary">
                This page requires a reset link from your email.
              </p>
            </div>
          </div>
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    const remaining = redirectAt === null ? 0 : Math.max(0, Math.ceil((redirectAt - now) / 1000));
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Password updated</h1>
              <p className="text-xs text-text-secondary">
                You can now sign in with your new password.
              </p>
            </div>
          </div>
          <p className="text-sm text-text-secondary mb-5">
            Redirecting to sign in in {remaining}s…
          </p>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => router.push('/login?reset=success')}
            className="w-full"
          >
            Continue to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Set a new password</h1>
            <p className="text-xs text-text-secondary">
              Choose a strong password you don&apos;t use anywhere else.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField
            id="new-password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            showStrength
            requiredMark
            disabled={submitting}
          />
          <div>
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Type your new password again"
              autoComplete="new-password"
              requiredMark
              disabled={submitting}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-[11px] text-red-600">
                Passwords don&apos;t match.
              </p>
            )}
          </div>

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
            {submitting ? 'Updating…' : 'Update password'}
          </Button>
        </form>

        <Link
          href="/login"
          className="mt-5 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
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
      <ResetPasswordForm />
    </Suspense>
  );
}
