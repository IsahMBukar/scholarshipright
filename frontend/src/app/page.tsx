'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const FEATURES = [
  { icon: 'auto_awesome', title: 'AI Match Scoring', desc: 'Get personalized scholarship matches based on your academic profile, research interests, and goals.' },
  { icon: 'public', title: '100+ Scholarships', desc: 'Fully funded opportunities from DAAD, Chevening, MEXT, Fulbright, and many more.' },
  { icon: 'smart_toy', title: 'ScholarBot Advisor', desc: 'AI chat assistant to help you find, compare, and apply for scholarships.' },
  { icon: 'notifications', title: 'Deadline Reminders', desc: 'Never miss a deadline with smart reminders and tracking.' },
];

const SCHOLARSHIPS = [
  'DAAD (Germany)', 'Chevening (UK)', 'MEXT (Japan)', 'Fulbright (USA)',
  'Commonwealth (UK)', 'Korean GKS', 'Turkish Burslari', 'Australia Awards',
  'ETH Zurich', 'Gates Cambridge', 'Chinese CSC', 'Swedish Institute',
];

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then((r) => {
        if (r.ok) router.replace('/scholarships');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 h-16 border-b border-gray-200">
        <span className="text-[22px] font-extrabold text-primary">ScholarshipRight</span>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-[14px] font-semibold text-text-secondary hover:text-text-primary transition-colors px-4 py-2">
            Sign In
          </Link>
          <Link href="/login" className="text-[14px] font-semibold text-text-inverse bg-primary px-5 py-2.5 rounded-btn hover:brightness-110 transition-all">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 md:px-12 py-16 md:py-24 max-w-[1200px] mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-light/30 rounded-btn text-[13px] font-semibold text-text-primary mb-6">
          <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome</span>
          AI-Powered Scholarship Discovery
        </div>

        <h1 className="text-[36px] md:text-[56px] font-extrabold text-text-primary leading-[1.1] mb-6">
          Find Fully Funded<br />
          <span className="text-primary">Scholarships</span> That Match You
        </h1>

        <p className="text-[16px] md:text-[18px] text-text-secondary max-w-[600px] mx-auto mb-8 leading-relaxed">
          Stop scrolling through hundreds of scholarship pages. Our AI matches your profile with the best fully funded international scholarships — in seconds.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/login" className="w-full sm:w-auto text-[16px] font-bold text-text-inverse bg-primary px-8 py-4 rounded-btn hover:brightness-110 transition-all shadow-lg shadow-primary/20">
            Start Finding Scholarships →
          </Link>
          <a href="#features" className="w-full sm:w-auto text-[14px] font-semibold text-text-secondary px-6 py-4 hover:text-text-primary transition-colors">
            Learn More ↓
          </a>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-8 md:gap-16 mt-12 pt-8 border-t border-gray-200">
          {[
            { value: '100+', label: 'Scholarships Indexed' },
            { value: '18', label: 'Countries Covered' },
            { value: 'AI', label: 'Match Scoring' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-[28px] md:text-[32px] font-extrabold text-primary">{stat.value}</p>
              <p className="text-[13px] text-text-secondary">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Scholarships we track */}
      <section className="px-6 md:px-12 py-12 bg-gray-100">
        <div className="max-w-[1200px] mx-auto text-center">
          <p className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider mb-6">Scholarships We Track</p>
          <div className="flex flex-wrap justify-center gap-3">
            {SCHOLARSHIPS.map((s) => (
              <span key={s} className="px-4 py-2 bg-white rounded-chip text-[13px] font-medium text-text-primary border border-gray-200">
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 md:px-12 py-16 md:py-24">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-[28px] md:text-[40px] font-extrabold text-text-primary mb-3">Everything You Need</h2>
            <p className="text-[16px] text-text-secondary max-w-[500px] mx-auto">From discovery to application — ScholarshipRight covers the entire journey.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white p-6 rounded-card border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-primary-light/30 rounded-chip flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-primary text-[24px]">{f.icon}</span>
                </div>
                <h3 className="text-[18px] font-bold text-text-primary mb-2">{f.title}</h3>
                <p className="text-[14px] text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-12 py-16 md:py-24 bg-gray-100">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-[28px] md:text-[40px] font-extrabold text-text-primary mb-3">How It Works</h2>
            <p className="text-[16px] text-text-secondary">Three simple steps to your scholarship match.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', icon: 'person', title: 'Build Your Profile', desc: 'Tell us about your degree, field, country, and target destinations.' },
              { step: '2', icon: 'psychology', title: 'AI Matches You', desc: 'Our engine scores every scholarship against your profile using semantic + rule-based matching.' },
              { step: '3', icon: 'send', title: 'Apply & Track', desc: 'Save scholarships, track deadlines, and apply with confidence.' },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-14 h-14 bg-primary text-text-inverse rounded-full flex items-center justify-center text-[24px] font-extrabold mx-auto mb-4">
                  {s.step}
                </div>
                <span className="material-symbols-outlined text-[32px] text-text-secondary mb-3 block">{s.icon}</span>
                <h3 className="text-[18px] font-bold text-text-primary mb-2">{s.title}</h3>
                <p className="text-[14px] text-text-secondary leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 py-16 md:py-24">
        <div className="max-w-[700px] mx-auto text-center">
          <h2 className="text-[28px] md:text-[40px] font-extrabold text-text-primary mb-4">Ready to Find Your Scholarship?</h2>
          <p className="text-[16px] text-text-secondary mb-8">Join students who are discovering fully funded opportunities with AI.</p>
          <Link href="/login" className="inline-block text-[16px] font-bold text-text-inverse bg-primary px-10 py-4 rounded-btn hover:brightness-110 transition-all shadow-lg shadow-primary/20">
            Get Started Free →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-12 py-8 border-t border-gray-200">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-[16px] font-bold text-primary">ScholarshipRight</span>
          <p className="text-[13px] text-text-secondary">© 2026 ScholarshipRight. AI-powered scholarship discovery.</p>
        </div>
      </footer>
    </div>
  );
}
