'use client';

// /signup — public sign-up page.
//
// Visual DNA is shared with /login and /admin/accept-invite so all three
// auth surfaces look and feel identical:
//   - Same `min-h-screen flex items-center justify-center p-6 bg-gray-100`
//     page layout
//   - Same `max-w-md w-full bg-white rounded-card border border-gray-200 p-8`
//     card (no shadow-sm — accept-invite is the source of truth)
//   - Same in-card icon+title+subtitle header (UserPlus icon)
//   - Same small subtle labels with red asterisk for required fields
//   - Same white-on-gray-200 input style (40px tall, rounded-btn, small text)
//   - Same red-pill error display with AlertTriangle icon
//   - Same `Button` from @/components/admin/ui/Button
//   - Same `PasswordField` from @/components/auth/PasswordField — and
//     because this is a NEW password, we surface the strength meter.
//
// Behavior:
//   - POST /api/auth/register with full_name + email + password.
//   - On success → /onboarding (so the new user walks the standard flow).
//   - On error → surface backend's `user_message` if present, else the
//     raw `detail`, else a generic "Registration failed".

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, AlertTriangle } from 'lucide-react';
import Button from '@/components/admin/ui/Button';
import PasswordField from '@/components/auth/PasswordField';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror backend schema: min 8 chars (already enforced by backend, but
  // we can show a soft hint and disable submit when too short).
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
        router.push('/onboarding');
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
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

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
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
