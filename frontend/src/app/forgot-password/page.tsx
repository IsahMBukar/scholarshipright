'use client';

// /forgot-password — request a password-reset link.
//
// Flow:
//   1. User enters their email
//   2. We POST /api/auth/forgot-password
//   3. The endpoint always returns 200 to prevent email enumeration
//   4. If the email is registered, the reset link is logged to the
//      backend console (the dev-mode "email")
//   5. We show a generic "check your inbox" success state
//   6. In dev mode, we ALSO render a clickable link to the reset
//      page so the operator can complete the flow without grepping
//      logs (the response includes dev_reset_url when
//      DEV_RETURN_RESET_TOKEN=1 is set on the backend).
//
// Visual DNA matches /login, /signup, and /admin/accept-invite:
//   - Same min-h-screen flex items-center justify-center p-6 bg-gray-100
//   - Same max-w-md w-full bg-white rounded-card border border-gray-200 p-8
//   - Same icon+title+subtitle header (Mail icon, gray-100 circle)
//   - Same input style and Button component
//   - Same red-pill error display

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail, AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react';
import Button from '@/components/admin/ui/Button';

import { API_URL } from '@/lib/env';

interface DevResetHint {
  url: string;
  token: string;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // Only populated when the backend is in dev mode (DEV_RETURN_RESET_TOKEN=1).
  // In production, this stays null and the user must find the email themselves.
  const [devHint, setDevHint] = useState<DevResetHint | null>(null);

  const canSubmit = email.trim().length > 0 && !submitting;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      // The endpoint always returns 200 for both registered and
      // non-registered emails (no enumeration). We treat 200 as
      // "submitted" regardless of the body shape.
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          dev_reset_url?: string;
          dev_reset_token?: string;
        };
        if (data.dev_reset_url && data.dev_reset_token) {
          setDevHint({ url: data.dev_reset_url, token: data.dev_reset_token });
        }
        setSubmitted(true);
      } else {
        // 429 (rate limit) or other server error — fall back to a
        // generic error. We don't surface the detail verbatim because
        // /forgot-password always uses 200 in its happy path.
        if (res.status === 429) {
          setError('Too many requests. Please wait a few minutes and try again.');
        } else {
          setError('Something went wrong. Please try again.');
        }
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Check your email</h1>
              <p className="text-xs text-text-secondary">
                If an account exists for that address, we&apos;ve sent a reset link.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              The link will expire in <span className="font-semibold text-text-primary">1 hour</span>.
              If you don&apos;t see the email, check your spam folder.
            </p>
            <p>
              You can close this tab and use the link from your inbox.
            </p>
          </div>

          {/* Dev-only: if the backend returned the raw reset URL, surface
              it as a clickable affordance so the operator (and E2E test)
              can complete the flow without checking the server log.
              In production this section is never rendered. */}
          {devHint && (
            <div className="mt-6 rounded-btn border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">
                  Dev only
                </span>
              </div>
              <p className="text-xs text-amber-800 mb-2">
                Backend is in dev mode (DEV_RETURN_RESET_TOKEN=1). The reset link
                is also logged to the server console.
              </p>
              <a
                href={devHint.url}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 hover:text-amber-700 underline break-all"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                {devHint.url}
              </a>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between text-xs">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </Link>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setDevHint(null);
                setEmail('');
              }}
              className="text-primary-readable font-semibold hover:underline"
            >
              Use a different email
            </button>
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
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Forgot your password?</h1>
            <p className="text-xs text-text-secondary">
              Enter your email and we&apos;ll send you a reset link.
            </p>
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
            {submitting ? 'Sending…' : 'Send reset link'}
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
