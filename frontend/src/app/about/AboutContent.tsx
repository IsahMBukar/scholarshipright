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

const VALUES = [
  {
    icon: '🎯',
    title: 'Accuracy over volume',
    desc: 'We don\'t give you 200 links. We give you 5 ranked matches with scores that mean something — because a 97% fit is worth more than 100 maybes.',
  },
  {
    icon: '🌍',
    title: 'Global by design',
    desc: 'Fully funded scholarships exist in 18+ countries. We index all of them — not just the English-speaking ones. DAAD, MEXT, Chevening, GKS, Erasmus+, and more.',
  },
  {
    icon: '🤖',
    title: 'AI that actually helps',
    desc: 'Scholara doesn\'t just chat. It drafts your motivation letter, compares award terms, and preps your documents. Real output, not just conversation.',
  },
  {
    icon: '🔓',
    title: 'Free to start',
    desc: 'No credit card. No paywall on matching. Build your profile, see your matches, and decide if it\'s right for you — before spending a cent.',
  },
];

const TIMELINE = [
  { year: '2024', title: 'The problem', desc: 'We watched students spend 100+ hours manually searching scholarship databases, copy-pasting the same essay, and missing deadlines buried in PDFs.' },
  { year: '2025', title: 'The engine', desc: 'We built an AI matching engine that reads scholarship criteria against real student profiles — semantic understanding, not keyword matching.' },
  { year: '2026', title: 'The platform', desc: 'ScholarshipRight launched: matching, Scholara advisor, deadline tracking, doc checklists, and 100+ fully funded awards indexed.' },
];

export default function AboutContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[720px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5b942] animate-pulse" />
            About ScholarshipRight
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            Every student deserves a{' '}
            <span className="text-[#f5b942]">fully funded</span> future.
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[520px] mx-auto leading-relaxed">
            ScholarshipRight exists because the scholarship search process is broken. Students waste hundreds of hours scrolling databases, guessing at eligibility, and missing awards they were perfect for. We fix that.
          </p>
        </motion.div>
      </header>

      {/* ═══ MISSION STATEMENT ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-20 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="bg-white rounded-2xl border border-[#f0ebe0] p-6 sm:p-10 text-center" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-4">Our mission</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight leading-snug max-w-[640px] mx-auto">
              Make fully funded scholarship discovery{' '}
              <span className="text-[#f5b942]">fast, accurate, and free</span>{' '}
              for every student — regardless of where they&apos;re from.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ═══ VALUES ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">What we believe</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">Built on four principles.</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {VALUES.map((v, i) => (
              <motion.div
                key={v.title}
                className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)]"
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: (i % 2) * 0.1 }}
              >
                <div className="w-11 h-11 rounded-xl bg-[#f5b942]/10 flex items-center justify-center text-xl mb-4">
                  {v.icon}
                </div>
                <h3 className="font-bold text-base sm:text-lg mb-2">{v.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TIMELINE ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[720px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">How we got here</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">From problem to platform.</h2>
          </motion.div>
          <div className="space-y-4 sm:space-y-5">
            {TIMELINE.map((t, i) => (
              <motion.div
                key={t.year}
                className="flex gap-4 sm:gap-6 items-start"
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.1 }}
              >
                <div className="flex-shrink-0 w-14 sm:w-16 h-14 sm:h-16 rounded-2xl bg-[#1a1a1a] flex items-center justify-center">
                  <span className="text-[#f5b942] font-black text-sm sm:text-base">{t.year}</span>
                </div>
                <div className="pt-1">
                  <h3 className="font-bold text-base sm:text-lg mb-1">{t.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{t.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-20 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6" {...fadeUp}>
            {[
              { num: '2,400+', label: 'students matched' },
              { num: '100+', label: 'awards indexed' },
              { num: '18', label: 'countries covered' },
              { num: '94%', label: 'match accuracy' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-6 text-center">
                <p className="text-2xl sm:text-3xl font-black text-[#f5b942]">{s.num}</p>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24">
        <motion.div className="max-w-[680px] mx-auto text-center" {...fadeUp}>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4">
            Ready to find your match?
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8 sm:mb-9 px-2 sm:px-0">
            Build your profile. See your top matches. Free — no card, no waiting.
          </p>
          <Link
            href="/signup"
            className="sr-border-beam inline-block relative text-base font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-9 py-4 hover:bg-[#d4972e] hover:text-white transition"
          >
            See your matches →
          </Link>
        </motion.div>
      </section>
    </LandingShell>
  );
}
