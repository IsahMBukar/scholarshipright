'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function OnboardingPage() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setUserName(data.full_name || data.email?.split('@')[0] || 'there');
        } else {
          router.push('/login');
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        <div className="mb-8">
          <span className="text-[28px] font-extrabold text-primary">ScholarshipRight</span>
        </div>
        <div className="bg-white p-8 rounded-card border border-gray-200 shadow-sm">
          <div className="w-16 h-16 bg-primary-light rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-primary text-[32px]">school</span>
          </div>
          <h1 className="text-[24px] font-bold text-text-primary mb-2">
            Welcome, {userName}! 👋
          </h1>
          <p className="text-[15px] text-text-secondary mb-8">
            Let's build your profile so we can match you with the best scholarships.
          </p>
          <button
            onClick={() => router.push('/profile')}
            className="w-full bg-primary text-text-inverse font-bold py-3.5 rounded-btn hover:brightness-110 transition-all mb-4"
          >
            Build My Profile →
          </button>
          <button
            onClick={() => router.push('/scholarships')}
            className="w-full text-primary font-semibold py-3 hover:underline text-[14px]"
          >
            Browse Scholarships First
          </button>
        </div>
      </div>
    </div>
  );
}
