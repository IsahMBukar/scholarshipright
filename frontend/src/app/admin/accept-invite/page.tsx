'use client';

// /admin/accept-invite — public page reached via the magic-link URL
// sent in invite emails. The token is the only credential.
//
// Flow:
//   1. Read ?token=... from URL (requires Suspense boundary in App Router).
//   2. Show a clean card: full_name + password + confirm-password.
//   3. POST /api/auth/accept-invite  →  backend sets the auth cookie
//      and stores the password hash on the user.
//   4. On success: welcome screen with auto-redirect to /onboarding,
//      so the new staff member walks through the standard onboarding
//      flow (profile → resume → matches → chat) and lands on the main
//      app with scholarship match, profile, resume, and agent all wired.
//   5. On error: surface the backend's `user_message`.
//
// We intentionally do NOT use AdminLayout (which gates on /api/auth/me +
// is_admin), because the invitee may not have an account yet. The segment
// layout at app/admin/layout.tsx only mounts Query/Toast/Confirm providers,
// which is safe.
//
// Visual design DNA: see /login and /signup — all three share the same
// `components/auth/PasswordField` and identical card / input / label /
// error / button styling.

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import Button from '@/components/admin/ui/Button';
import PasswordField from '@/components/auth/PasswordField';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface AcceptSuccess {
  accepted: true;
  user: {
    id: string;
    email: string;
    full_name: string | null;
    is_admin: boolean;
    admin_role: 'super_admin' | 'support_staff' | null;
  };
  invite: {
    id: string;
    email: string;
    admin_role: 'super_admin' | 'support_staff';
    accepted_at: string | null;
  };
}

interface ApiErrorBody {
  detail?:
    | string
    | {
        code?: string;
        user_message?: string;
      }
    | Array<{ msg?: string; loc?: string[] }>;
}

function ErrorState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">
          Invite not available
        </h2>
        <p className="text-sm text-text-secondary mb-6">{message}</p>
        <Button variant="secondary" onClick={onBack}>
          Back to home
        </Button>
      </div>
    </div>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<AcceptSuccess | null>(null);

  if (!token) {
    return (
      <ErrorState
        message="This invite link is missing its token. Please use the link from your invite email."
        onBack={() => router.push('/')}
      />
    );
  }

  // Client-side validation mirrors the backend schema (min 8 chars)
  const pwTooShort = password.length > 0 && password.length < 8;
  const pwMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const pwOk = password.length >= 8 && password === confirmPassword;
  const canSubmit = fullName.trim().length > 0 && pwOk && !submitting;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/accept-invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          full_name: fullName.trim(),
          password,
        }),
      });

      const text = await res.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }

      if (!res.ok) {
        const errBody = body as ApiErrorBody;
        let msg: string | null = null;
        if (Array.isArray(errBody?.detail)) {
          msg = errBody.detail
            .map((d) => d?.msg)
            .filter(Boolean)
            .join(' · ');
        } else if (errBody?.detail && typeof errBody.detail === 'object') {
          msg = (errBody.detail as { user_message?: string }).user_message || null;
        } else if (typeof errBody?.detail === 'string') {
          msg = errBody.detail;
        }
        setError(msg || `Request failed (${res.status})`);
        setSubmitting(false);
        return;
      }

      setSuccess(body as AcceptSuccess);
      // Redirect to /onboarding so the new staff member walks through
      // the standard profile → resume → matches → chat flow, which
      // unlocks scholarship match, profile, resume, and the agent.
      setTimeout(() => {
        router.push('/onboarding');
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Network error. Please check your connection and try again.'
      );
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            You&apos;re in!
          </h2>
          <p className="text-sm text-text-secondary mb-1">
            Welcome to the ScholarshipRight team.
          </p>
          <p className="text-xs text-text-secondary mb-4">
            Signed in as <span className="font-mono">{success.user.email}</span>
            {success.user.admin_role && (
              <> · <span className="font-mono">{success.user.admin_role}</span></>
            )}
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-text-secondary">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Taking you to onboarding…
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
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              Accept admin invite
            </h1>
            <p className="text-xs text-text-secondary">
              Set up your account to continue
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

          <PasswordField
            id="password"
            label="Set a password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            showStrength
            disabled={submitting}
          />
          {pwTooShort && (
            <p className="text-[11px] text-red-600 -mt-2">
              Password must be at least 8 characters.
            </p>
          )}

          <PasswordField
            id="confirm_password"
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            disabled={submitting}
          />
          {pwMismatch && (
            <p className="text-[11px] text-red-600 -mt-2">
              Passwords don&apos;t match.
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
            {submitting ? 'Creating account…' : 'Create account & continue'}
          </Button>

          <p className="text-[11px] text-text-secondary text-center">
            Your email is set by the inviter and can&apos;t be changed here.
            The link is single-use.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading invite…
          </div>
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}
