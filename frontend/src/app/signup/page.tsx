'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      if (res.ok) {
        router.push('/onboarding');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Registration failed');
      }
    } catch (err) {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-[28px] font-extrabold text-primary">ScholarshipRight</span>
          <h1 className="text-[32px] font-bold text-text-primary mt-4">Create Account</h1>
          <p className="text-[16px] text-text-secondary mt-2">Start finding your perfect scholarship</p>
        </div>

        <div className="bg-white p-8 rounded-card border border-gray-200 shadow-sm">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-card text-[13px] text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup}>
            <label className="text-[14px] font-semibold text-text-primary block mb-2">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              className="w-full p-3.5 bg-gray-100 border border-gray-200 rounded-card text-text-primary placeholder:text-text-secondary focus:ring-2 focus:ring-primary focus:border-transparent mb-4"
            />

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
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-[14px] text-text-secondary mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
