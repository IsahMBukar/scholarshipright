'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        <div className="mb-8">
          <span className="font-headline-md text-headline-md font-bold text-primary">scholarshipright</span>
        </div>
        <div className="bg-surface-white p-8 rounded-xl border border-outline-variant">
          <div className="w-16 h-16 bg-primary-light rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-primary text-3xl">school</span>
          </div>
          <h1 className="font-display-lg text-display-lg text-on-surface mb-4">Welcome to ScholarshipRight!</h1>
          <p className="font-body-lg text-on-surface-variant mb-8">
            Let&apos;s build your profile so we can match you with the best scholarships.
          </p>
          <button
            onClick={() => router.push('/profile')}
            className="w-full bg-primary-container text-on-primary-container font-bold py-3.5 rounded-xl hover:brightness-95 transition-all mb-4"
          >
            Build My Profile →
          </button>
          <button
            onClick={() => router.push('/scholarships')}
            className="w-full text-primary font-label-md py-3 hover:underline"
          >
            Browse Scholarships First
          </button>
        </div>
      </div>
    </div>
  );
}
