'use client';

// AuthModal — shown when a guest tries to do a protected action (save, apply, match).
// After login/signup, replays the pending action automatically.
//
// Design: non-blocking overlay, not a full-page redirect. User stays in context.

import { useState, useEffect } from 'react';
import { useAuth, type PendingAction } from '@/hooks/useAuth';
import GoogleButton from '@/components/auth/GoogleButton';
import PasswordField from '@/components/auth/PasswordField';
import Button from '@/components/admin/ui/Button';

export default function AuthModal() {
  const { pendingAction, setPendingAction, login, refresh } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (pendingAction) {
      setEmail('');
      setPassword('');
      setFullName('');
      setError('');
      setMode('login');
    }
  }, [pendingAction]);

  if (!pendingAction) return null;

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.ok) {
      // Replay the pending action
      const action = pendingAction;
      setPendingAction(null);
      action.onReplay?.();
    } else {
      setError(result.error || 'Login failed');
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      if (res.ok) {
        await refresh();
        const action = pendingAction;
        setPendingAction(null);
        action.onReplay?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Registration failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setPendingAction(null);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] animate-onboarding-slide-up overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-text-secondary"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-primary text-[20px]">
              {pendingAction.type === 'save' ? 'bookmark' : pendingAction.type === 'apply' ? 'send' : 'auto_awesome'}
            </span>
          </div>
          <h2 className="text-[18px] font-bold text-text-primary">
            {pendingAction.label}
          </h2>
          <p className="text-[13px] text-text-secondary mt-1">
            {mode === 'login'
              ? 'Sign in to continue, or create a free account.'
              : 'Create a free account to continue.'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="px-6 pb-2 space-y-3">
          <GoogleButton label={mode === 'login' ? 'Continue with Google' : 'Sign up with Google'} />

          <div className="relative flex items-center justify-center my-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <span className="relative bg-white px-3 text-[11px] font-medium text-text-secondary uppercase tracking-wider">
              or
            </span>
          </div>

          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-fullname" className="text-[12px] font-semibold text-text-secondary block mb-1">Full Name</label>
              <input
                id="auth-fullname"
                name="full_name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-btn text-sm text-text-primary focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
                required
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className="text-[12px] font-semibold text-text-secondary block mb-1">Email</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-btn text-sm text-text-primary focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
              required
              autoFocus
            />
          </div>
          <PasswordField
            id="auth-password"
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            className="w-full"
          >
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        {/* Toggle mode */}
        <div className="px-6 py-4 text-center text-[13px] text-text-secondary">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button onClick={() => { setMode('signup'); setError(''); }} className="text-primary-readable font-semibold hover:underline">
                Sign up free
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className="text-primary-readable font-semibold hover:underline">
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
