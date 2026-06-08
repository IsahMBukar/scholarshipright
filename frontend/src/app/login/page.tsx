'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isMagicLink, setIsMagicLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then((r) => {
        if (r.ok) router.push('/scholarships');
      })
      .finally(() => setChecking(false));
  }, [router]);

  const handleDevLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/dev-login`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        router.push('/scholarships');
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setIsMagicLink(true);
    setLoading(false);
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
          <h1 className="text-[32px] font-bold text-text-primary mt-4">Welcome</h1>
          <p className="text-[16px] text-text-secondary mt-2">Sign in to access your scholarship matches</p>
        </div>

        <div className="bg-white p-8 rounded-card border border-gray-200 shadow-sm">
          {!isMagicLink ? (
            <>
              <button
                onClick={handleDevLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-primary text-text-inverse font-bold py-3.5 rounded-btn hover:brightness-110 transition-all mb-4 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">bolt</span>
                {loading ? 'Signing in...' : 'Quick Dev Login'}
              </button>
              <p className="text-[13px] text-text-secondary text-center mb-6">
                Test account: test@scholarshipright.com
              </p>

              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[13px] text-text-secondary">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <form onSubmit={handleMagicLink}>
                <label className="text-[14px] font-semibold text-text-primary block mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full p-3.5 bg-gray-100 border border-gray-200 rounded-card text-text-primary placeholder:text-text-secondary focus:ring-2 focus:ring-primary focus:border-transparent mb-4"
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-100 text-text-primary font-bold py-3.5 rounded-btn hover:bg-gray-200 transition-all disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Magic Link'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-8">
              <span className="material-symbols-outlined text-6xl text-primary mb-4 block">mark_email_read</span>
              <h3 className="text-[20px] font-bold text-text-primary mb-2">Check your email</h3>
              <p className="text-[16px] text-text-secondary mb-4">
                We sent a sign-in link to <strong>{email}</strong>
              </p>
              <button onClick={() => setIsMagicLink(false)} className="text-primary font-semibold hover:underline">
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
