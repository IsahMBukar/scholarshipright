'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import LandingShell from '@/components/LandingShell';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
};

const FEATURES = [
  {
    icon: '🎯',
    title: 'AI Matching Engine',
    desc: 'Semantic AI reads your profile against 100+ awards and scores every scholarship 0–100 by real fit. Not keyword search — actual understanding.',
    href: '/features/ai-matching',
    badge: 'Core engine',
  },
  {
    icon: '📄',
    title: 'Resume Builder',
    desc: 'Upload your resume, get AI analysis with issue detection, auto-rewrite weak sections, and export a polished PDF — all in one place.',
    href: '/features/resume-builder',
    badge: 'AI-powered',
  },
  {
    icon: '📊',
    title: 'Application Tracking',
    desc: 'Every scholarship, every deadline, every status — from saved to submitted to accepted. Kanban dashboard with smart reminders.',
    href: '/features/application-tracking',
    badge: 'Dashboard',
  },
  {
    icon: '💬',
    title: 'AI Coach — Scholara',
    desc: 'Your personal scholarship advisor. Drafts essays, compares awards, answers eligibility questions, and preps your documents 24/7.',
    href: '/features/ai-coach',
    badge: 'Always on',
  },
  {
    icon: '🎤',
    title: 'Interview Prep',
    desc: 'AI-powered mock interviews tailored to each scholarship. Get scored on your answers, receive instant feedback, and walk in prepared.',
    href: '/features/interview-prep',
    badge: 'Coming soon',
  },
];

const STATS = [
  { num: '94%', label: 'match accuracy' },
  { num: '30s', label: 'to get matched' },
  { num: '100+', label: 'awards indexed' },
  { num: '114hrs', label: 'saved per app' },
];

export default function FeaturesContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[720px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5b942] animate-pulse" />
            Platform features
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            Everything you need to <span className="text-[#f5b942]">win</span> a scholarship.
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[540px] mx-auto leading-relaxed">
            From discovery to acceptance. Five AI-powered tools that take you from &ldquo;I need funding&rdquo; to &ldquo;I got it.&rdquo;
          </p>
        </motion.div>
      </header>

      {/* ═══ STATS ═══ */}
      <section className="px-4 sm:px-6 pb-12">
        <motion.div className="max-w-[1080px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-4" {...fadeUp}>
          {STATS.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 text-center">
              <p className="text-2xl sm:text-3xl font-black text-[#f5b942]">{s.num}</p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ═══ FEATURE CARDS ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <div className="space-y-4 sm:space-y-5">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.06 }}>
                <Link
                  href={f.href}
                  className="block bg-white rounded-2xl border border-[#f0ebe0] p-6 sm:p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)] hover:border-[#f5b942]/40 group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-[#f5b942]/10 flex items-center justify-center text-3xl flex-shrink-0">
                      {f.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-lg sm:text-xl font-black group-hover:text-[#d4972e] transition-colors">{f.title}</h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#1a1a1a] text-[#f5b942]">
                          {f.badge}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-[640px]">{f.desc}</p>
                      <span className="inline-block mt-3 text-sm font-semibold text-[#d4972e] group-hover:underline">
                        Learn more →
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <motion.div className="max-w-[680px] mx-auto text-center" {...fadeUp}>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4">
            Try every feature free.
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8 sm:mb-9 px-2 sm:px-0">
            No credit card. No paywall on matching. Build your profile and see what AI can do.
          </p>
          <Link
            href="/signup"
            className="sr-border-beam inline-block relative text-base font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-9 py-4 hover:bg-[#d4972e] hover:text-white transition"
          >
            Get started free →
          </Link>
        </motion.div>
      </section>
    </LandingShell>
  );
}
