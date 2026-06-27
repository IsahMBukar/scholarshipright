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

const STATUSES = [
  { label: 'Saved', color: 'bg-gray-100 text-gray-700', icon: '🔖', desc: 'Scholarships you\'re interested in. Add notes, set reminders.' },
  { label: 'Preparing', color: 'bg-blue-50 text-blue-700', icon: '📝', desc: 'Gathering documents, drafting essays, requesting recommendation letters.' },
  { label: 'Applied', color: 'bg-[#f5b942]/10 text-[#d4972e]', icon: '📤', desc: 'Application submitted. Track confirmation and follow-up dates.' },
  { label: 'Accepted', color: 'bg-green-50 text-green-700', icon: '🎉', desc: 'You got it! Track next steps: visa, enrollment, travel.' },
];

const FEATURES = [
  {
    icon: '🔔',
    title: 'Smart deadline reminders',
    desc: 'Every saved scholarship gets a 14-day, 7-day, and 2-day reminder chain. Delivered via email and in-app notification. You\'ll never miss a deadline again.',
  },
  {
    icon: '📋',
    title: 'Per-award doc checklists',
    desc: 'Each scholarship has its own document checklist: transcripts, CV, certificates, language scores, recommendation letters. Check them off as you go.',
  },
  {
    icon: '📊',
    title: 'Application dashboard',
    desc: 'See all your scholarships in one view. Filter by status, sort by deadline, and track your pipeline from first save to final acceptance.',
  },
  {
    icon: '📝',
    title: 'Notes & context',
    desc: 'Add personal notes to each scholarship. Track which version of your essay you submitted, who your referees are, and what follow-up is needed.',
  },
  {
    icon: '📈',
    title: 'Progress tracking',
    desc: 'See how many applications are in each stage. Identify bottlenecks. Know exactly what needs your attention right now.',
  },
  {
    icon: '🔗',
    title: 'Direct links',
    desc: 'Quick access to each scholarship\'s official application portal. No digging through bookmarks or search results.',
  },
];

export default function AppTrackingContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[720px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            Dashboard
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            Track every application. <span className="text-[#f5b942]">Miss</span> nothing.
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[540px] mx-auto leading-relaxed">
            From saved to accepted. One dashboard shows every scholarship, every deadline, every document — so nothing slips through the cracks.
          </p>
        </motion.div>
      </header>

      {/* ═══ STATUS PIPELINE ═══ */}
      <section className="px-4 sm:px-6 pb-12">
        <motion.div className="max-w-[1080px] mx-auto" {...fadeUp}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {STATUSES.map((s, i) => (
              <div key={s.label} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 text-center relative">
                <span className="text-3xl mb-2 block">{s.icon}</span>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${s.color} mb-2`}>{s.label}</span>
                <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                {i < STATUSES.length - 1 && (
                  <span className="hidden md:block absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 text-gray-300 text-lg">→</span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">What you get</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Built for the full application lifecycle.</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)]" {...fadeUp} transition={{ ...fadeUp.transition, delay: (i % 3) * 0.08 }}>
                <div className="w-11 h-11 rounded-xl bg-[#f5b942]/10 flex items-center justify-center text-xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-base sm:text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <motion.div className="max-w-[680px] mx-auto text-center" {...fadeUp}>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4">Stay organized. Stay on track.</h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8">Start tracking your scholarship applications today. Free.</p>
          <Link href="/signup" className="sr-border-beam inline-block relative text-base font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-9 py-4 hover:bg-[#d4972e] hover:text-white transition">
            Start tracking →
          </Link>
        </motion.div>
      </section>
    </LandingShell>
  );
}
