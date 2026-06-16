'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Only allow internal paths as the ?next= target. Block absolute URLs and
// protocol-relative ones to prevent open-redirect via crafted query.
function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get('next'), '/scholarships');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then((r) => {
        if (r.ok) router.push(nextPath);
      })
      .finally(() => setChecking(false));
  }, [router, nextPath]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        // If a `?next` was passed (e.g. /admin), honor it. Otherwise
        // walk through onboarding if the user has no profile.
        if (searchParams.get('next')) {
          router.push(nextPath);
          return;
        }
        try {
          const profileRes = await fetch(`${API_URL}/api/profile`, { credentials: 'include' });
          if (profileRes.status === 404) {
            router.push('/onboarding');
          } else {
            router.push('/scholarships');
          }
        } catch {
          router.push('/scholarships');
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Invalid email or password');
      }
    } catch (err) {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/dev-login`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) router.push(nextPath);
    } catch (err) {
      setError('Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-[28px] font-extrabold text-primary">ScholarshipRight</span>
          <h1 className="text-[32px] font-bold text-text-primary mt-4">Welcome back</h1>
          <p className="text-[16px] text-text-secondary mt-2">Sign in to your account</p>
        </div>

        <div className="bg-white p-8 rounded-card border border-gray-200 shadow-sm">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-card text-[13px] text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <label className="text-[14px] font-semibold text-text-primary block mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full p-3.5 bg-gray-100 border border-gray-200 rounded-card text-text-primary placeholder:text-text-secondary focus:ring-2 focus:ring-primary focus:border-transparent mb-4"
              required
            />

            <label className="text-[14px] font-semibold text-text-primary block mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-3.5 bg-gray-100 border border-gray-200 rounded-card text-text-primary placeholder:text-text-secondary focus:ring-2 focus:ring-primary focus:border-transparent mb-6"
              required
              minLength={6}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-text-inverse font-bold py-3.5 rounded-btn hover:brightness-110 transition-all disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-[14px] text-text-secondary mt-6">
            Don't have an account?{' '}
            <Link href="/signup" className="text-primary font-semibold hover:underline">
              Sign up
            </Link>
          </p>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[13px] text-text-secondary">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button
            onClick={handleDevLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-text-secondary font-medium py-3 rounded-btn hover:bg-gray-200 transition-all text-[13px] disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">bolt</span>
            Quick Dev Login (test@scholarshipright.com)
          </button>
        </div>
      </div>
    </div>
  );
}
