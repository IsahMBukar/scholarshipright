'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';

import { API_URL } from '@/lib/env';

function UnsubscribeInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const category = searchParams.get('category') || '';

  const [verifying, setVerifying] = useState(true);
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('');
  const [scope, setScope] = useState<'single' | 'all'>('single');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      return;
    }
    fetch(`${API_URL}/api/unsubscribe/verify?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setValid(true);
          setEmail(data.email || '');
          setCategoryLabel(data.category_label || category);
        }
      })
      .catch((err) => console.error('[Unsubscribe] Failed to verify unsubscribe token:', err))
      .finally(() => setVerifying(false));
  }, [token, category]);

  const handleUnsubscribe = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, scope }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
        setMessage(data.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('[Unsubscribe] Unsubscribe request failed:', err);
      setError('Could not connect. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[#f5b942] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Verifying…</p>
        </div>
      </div>
    );
  }

  if (!token || !valid) {
    return (
      <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center px-4">
        <div className="max-w-[420px] w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-3xl mx-auto mb-4">✕</div>
          <h1 className="text-xl font-black text-[#1a1a1a] mb-2">Invalid link</h1>
          <p className="text-sm text-gray-600 mb-6">This unsubscribe link is invalid or has expired.</p>
          <Link href="/" className="text-sm font-semibold text-[#d4972e] hover:underline">← Back to ScholarshipRight</Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center px-4">
        <div className="max-w-[420px] w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
          <h1 className="text-xl font-black text-[#1a1a1a] mb-2">Unsubscribed</h1>
          <p className="text-sm text-gray-600 mb-6">{message}</p>
          <div className="bg-white rounded-2xl border border-[#f0ebe0] p-5 mb-6">
            <p className="text-xs text-gray-500 mb-2">Changed your mind?</p>
            <p className="text-sm text-gray-600">
              You can re-enable emails anytime from{' '}
              <Link href="/settings" className="text-[#d4972e] font-semibold hover:underline">Settings → Email Preferences</Link>.
            </p>
          </div>
          <Link href="/" className="text-sm font-semibold text-[#d4972e] hover:underline">← Back to ScholarshipRight</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center px-4">
      <div className="max-w-[420px] w-full">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <Image src="/images/logo-light.jpg" alt="ScholarshipRight" width={32} height={32} className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-extrabold">Scholarship<span className="text-[#f5b942]">Right</span></span>
          </Link>
          <h1 className="text-xl font-black text-[#1a1a1a] mb-2">Unsubscribe from emails</h1>
          {email && <p className="text-sm text-gray-500">{email}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-[#f0ebe0] p-6 mb-6">
          <p className="text-sm text-gray-600 mb-4">You&apos;re unsubscribing from:</p>

          <div className="space-y-2 mb-6">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-[#f0ebe0] cursor-pointer hover:border-[#f5b942] transition">
              <input
                type="radio"
                name="scope"
                value="single"
                checked={scope === 'single'}
                onChange={() => setScope('single')}
                className="accent-[#f5b942]"
              />
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a]">{categoryLabel}</p>
                <p className="text-xs text-gray-500">Only this type of email</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-[#f0ebe0] cursor-pointer hover:border-[#f5b942] transition">
              <input
                type="radio"
                name="scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="accent-[#f5b942]"
              />
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a]">All emails</p>
                <p className="text-xs text-gray-500">Stop all non-essential emails from ScholarshipRight</p>
              </div>
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 mb-4">
              <span className="text-red-600 text-sm">✕</span>
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleUnsubscribe}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-[#1a1a1a] text-white text-sm font-bold hover:bg-[#333] transition disabled:opacity-50"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Unsubscribing…
              </span>
            ) : (
              'Unsubscribe'
            )}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center">
          Auth emails (verification, password reset) are always sent and cannot be disabled.
        </p>
      </div>
    </div>
  );
}

export default function UnsubscribeContent() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#f5b942] rounded-full animate-spin" />
      </div>
    }>
      <UnsubscribeInner />
    </Suspense>
  );
}
