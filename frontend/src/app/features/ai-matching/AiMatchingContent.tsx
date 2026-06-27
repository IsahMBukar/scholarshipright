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

const STEPS = [
  { num: '01', title: 'Build your profile', desc: 'Degree level, field of study, research interests, GPA, target countries, language scores. One form, four minutes.' },
  { num: '02', title: 'AI reads every criterion', desc: 'Our semantic engine parses each scholarship\'s actual eligibility criteria — not just tags or keywords. It understands what "strong background in renewable energy policy" means.' },
  { num: '03', title: 'Rule-based filters apply', desc: 'Hard filters check degree level, nationality, GPA thresholds, language requirements, and deadlines. If you\'re ineligible, the score drops — no false hope.' },
  { num: '04', title: 'You get a ranked list', desc: 'Every scholarship gets a 0–100 fit score. Your top 5 come with explanations: why it fits, what to prepare, and how strong your match is.' },
];

const BREAKDOWN = [
  { label: 'Semantic fit', max: 30, desc: 'Cosine similarity between your research interests and award criteria' },
  { label: 'Field match', max: 15, desc: 'How well your degree field aligns with eligible fields' },
  { label: 'Country preference', max: 10, desc: 'Does the host country match your target destinations?' },
  { label: 'Degree level', max: 12, desc: 'Bachelor, master, or PhD — matches your current level' },
  { label: 'Academic strength', max: 10, desc: 'GPA and institution tier relative to requirements' },
  { label: 'Language scores', max: 8, desc: 'IELTS/TOEFL scores vs minimum requirements' },
  { label: 'Resume keywords', max: 15, desc: 'Overlap between your experience and award expectations' },
  { label: 'Research experience', max: 10, desc: 'Publications, research roles, thesis work detected in resume' },
];

const MATCHES = [
  { name: 'DAAD EPOS Scholarship', location: 'Germany · Masters · Renewable Energy', amount: '€1,200/mo', score: 97 },
  { name: 'Chevening Scholarship', location: 'UK · Masters · Any field', amount: 'Full cost', score: 91 },
  { name: 'MEXT Scholarship', location: 'Japan · Research / Masters', amount: '¥117k/mo', score: 84 },
];

export default function AiMatchingContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16 relative overflow-hidden">
        <motion.div className="text-center max-w-[720px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5b942] animate-pulse" />
            Core engine
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            AI that <span className="text-[#f5b942]">understands</span> scholarships.
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[540px] mx-auto leading-relaxed mb-6">
            Not keyword search. Not tag matching. Our engine reads your academic profile, research interests, and target destinations — then scores 100+ awards by real fit. In 30 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/signup" className="sr-border-beam relative text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-7 py-3.5 hover:bg-[#d4972e] hover:text-white transition w-full sm:w-auto text-center">
              See your matches →
            </Link>
            <a href="#how" className="text-sm font-medium text-[#1a1a1a] px-6 py-3.5 rounded-full border border-[#f0ebe0] hover:border-[#f5b942] transition w-full sm:w-auto text-center">
              How it works
            </a>
          </div>
        </motion.div>
      </header>

      {/* ═══ SAMPLE MATCHES ═══ */}
      <section className="px-4 sm:px-6 pb-12">
        <motion.div className="max-w-[640px] mx-auto space-y-2.5" {...fadeUp}>
          {MATCHES.map((m) => (
            <div key={m.name} className="flex items-center justify-between gap-4 bg-white rounded-xl border border-[#f0ebe0] p-4 hover:border-[#f5b942] transition">
              <div>
                <p className="text-sm font-bold text-[#1a1a1a]">{m.name}</p>
                <p className="text-xs text-gray-500">{m.location}</p>
              </div>
              <div className="text-right flex items-center gap-3">
                <span className="text-sm font-bold text-[#d4972e]">{m.amount}</span>
                <div className="relative w-10 h-10 flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f0ebe0" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f5b942" strokeWidth="3" strokeDasharray={`${m.score} 100`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-[#1a1a1a]">{m.score}%</span>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how" className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">How matching works</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Four steps. 30 seconds.</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {STEPS.map((s, i) => (
              <motion.div key={s.num} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7" {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.1 }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 rounded-lg bg-[#1a1a1a] text-[#f5b942] flex items-center justify-center font-black text-sm">{s.num}</span>
                </div>
                <h3 className="font-bold text-base sm:text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SCORE BREAKDOWN ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[760px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">Score breakdown</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">What goes into a fit score?</h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-[480px] mx-auto">Every scholarship gets a 0–100 score built from these weighted components.</p>
          </motion.div>
          <div className="space-y-3">
            {BREAKDOWN.map((b, i) => (
              <motion.div key={b.label} className="flex items-center gap-4 bg-white rounded-xl border border-[#f0ebe0] p-4" {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.04 }}>
                <div className="flex-shrink-0 w-10 text-center">
                  <span className="text-sm font-black text-[#f5b942]">{b.max}</span>
                  <p className="text-[9px] text-gray-400">max</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#1a1a1a]">{b.label}</p>
                  <p className="text-xs text-gray-500 truncate">{b.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24">
        <motion.div className="max-w-[680px] mx-auto text-center" {...fadeUp}>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4">See your score.</h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8">Build your profile. Get matched in 30 seconds. Free.</p>
          <Link href="/signup" className="sr-border-beam inline-block relative text-base font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-9 py-4 hover:bg-[#d4972e] hover:text-white transition">
            See your matches →
          </Link>
        </motion.div>
      </section>
    </LandingShell>
  );
}
