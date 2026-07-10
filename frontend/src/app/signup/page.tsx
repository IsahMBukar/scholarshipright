'use client';

// /signup — public sign-up page.
//
// Flow (mirrors /forgot-password):
//   1. User fills form, submits
//   2. Page transforms to "Confirm your email" success state
//   3. User clicks link in email → auto-login → /onboarding

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { UserPlus, AlertTriangle, Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import Button from '@/components/admin/ui/Button';
import PasswordField from '@/components/auth/PasswordField';
import GoogleButton from '@/components/auth/GoogleButton';

import { API_URL } from '@/lib/env';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const pwTooShort = password.length > 0 && password.length < 8;
  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    !submitting;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
      const detail = data.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (detail && typeof detail === 'object' && 'user_message' in detail) {
        setError(String((detail as { user_message?: string }).user_message));
      } else {
        setError('Registration failed. Please try again.');
      }
    } catch (err) {
      console.error('[Signup] Registration request failed:', err);
      setError('Connection failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state: "Confirm your email" ──
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
                We&apos;ve sent a confirmation link to your inbox.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-btn border border-gray-200 bg-gray-50 p-4 mb-6">
            <Mail className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-text-primary">{email}</p>
              <p className="text-[11px] text-text-secondary mt-0.5">
                Click the link in the email to confirm your address.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              The link expires in <span className="font-semibold text-text-primary">24 hours</span>.
              If you don&apos;t see the email, check your spam folder.
            </p>
          </div>

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
              disabled={resendSent}
              onClick={async () => {
                setResendSent(false);
                await fetch(`${API_URL}/api/auth/resend-confirmation`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: email.trim() }),
                });
                setResendSent(true);
              }}
              className={`font-semibold ${resendSent ? 'text-emerald-600' : 'text-primary hover:underline'}`}
            >
              {resendSent ? 'Email sent ✓' : 'Resend confirmation'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration form ──
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Create account</h1>
            <p className="text-xs text-text-secondary">
              Start finding your perfect scholarship
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <GoogleButton label="Sign up with Google" />

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
              htmlFor="full_name"
              className="block text-xs font-medium text-text-secondary mb-1"
            >
              Full name
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Aisha Mohammed"
              disabled={submitting}
              required
              className="w-full h-10 px-3 rounded-btn border border-gray-200 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
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
            placeholder="At least 8 characters"
            autoComplete="new-password"
            showStrength
            disabled={submitting}
            requiredMark
          />
          {pwTooShort && (
            <p className="text-[11px] text-red-600 -mt-2">
              Password must be at least 8 characters.
            </p>
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
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="text-[11px] text-text-secondary text-center mt-4">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="text-primary-readable hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-primary-readable hover:underline">Privacy Policy</Link>.
        </p>

        <p className="text-[11px] text-text-secondary text-center mt-3">
          Already have an account?{' '}
          <Link href="/login" className="text-primary-readable font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
