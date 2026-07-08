'use client';

import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import Link from 'next/link';

export default function InterviewPage() {
  return (
    <AppLayout showRightPanel={false}>
      <PageHeader title="Interview" />
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        {/* Animated icon */}
        <div className="relative mb-8">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#f5b942]/20 to-[#f5b942]/5 flex items-center justify-center">
            <span className="material-symbols-outlined text-[56px] text-[#f5b942]">
              quiz
            </span>
          </div>
          {/* Floating elements */}
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-[#f5b942] rounded-full animate-pulse" />
          <div className="absolute -bottom-1 -left-3 w-3 h-3 bg-[#f5b942]/60 rounded-full animate-pulse delay-300" />
          <div className="absolute top-1/2 -right-5 w-2 h-2 bg-[#f5b942]/40 rounded-full animate-pulse delay-700" />
        </div>

        {/* Badge */}
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#f5b942]/10 text-[#f5b942] text-[12px] font-bold uppercase tracking-wider rounded-full mb-5">
          <span className="w-2 h-2 bg-[#f5b942] rounded-full animate-pulse" />
          Coming Soon
        </span>

        {/* Title */}
        <h2 className="text-[24px] md:text-[28px] font-bold text-text-primary mb-3">
          Mock Interview Prep
        </h2>

        {/* Description */}
        <p className="text-[14px] md:text-[15px] text-text-secondary max-w-md leading-relaxed mb-8">
          Practice scholarship interviews with AI-powered mock sessions. Get scored on your answers, 
          receive instant feedback, and walk into your real interview fully prepared.
        </p>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl w-full mb-10">
          {[
            { icon: 'school', title: 'Real Questions', desc: 'Questions sourced from actual scholarship interviews' },
            { icon: 'assessment', title: 'Instant Scoring', desc: 'Get rated on clarity, relevance, and confidence' },
            { icon: 'replay', title: 'Retry & Improve', desc: 'Practice unlimited times until you nail it' },
          ].map((f) => (
            <div key={f.title} className="bg-white border border-gray-200 rounded-xl p-5 text-center">
              <span className="material-symbols-outlined text-[28px] text-[#f5b942] mb-2 block">{f.icon}</span>
              <h3 className="text-[13px] font-bold text-text-primary mb-1">{f.title}</h3>
              <p className="text-[12px] text-text-secondary leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-[13px] text-text-secondary">We&apos;re crafting the perfect interview experience.</p>
          <Link
            href="/scholarships"
            className="px-6 py-2.5 bg-[#f5b942] text-white text-[14px] font-semibold rounded-lg hover:brightness-110 transition-all"
          >
            Browse Scholarships
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
