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

const HOW_IT_WORKS = [
  { num: '01', title: 'Choose your scholarship', desc: 'Select the award you\'re preparing for. Scholara pulls the scholarship\'s actual interview format, common questions, and evaluation criteria.' },
  { num: '02', title: 'Practice with AI', desc: 'Answer questions in a realistic mock interview. Scholara adapts follow-ups based on your responses — just like a real panel.' },
  { num: '03', title: 'Get scored & feedback', desc: 'Every answer gets scored on relevance, depth, clarity, and alignment with the scholarship\'s values. Specific feedback tells you what to improve.' },
  { num: '04', title: 'Refine & repeat', desc: 'Practice weak areas, try different approaches, and build confidence. By interview day, you\'ve already done it five times.' },
];

const FEATURES = [
  {
    icon: '🎤',
    title: 'Scholarship-specific questions',
    desc: 'Not generic interview prep. Questions are tailored to each scholarship\'s values, criteria, and past interview patterns. DAAD asks different questions than Chevening.',
  },
  {
    icon: '🧠',
    title: 'Adaptive follow-ups',
    desc: 'The AI listens to your answers and asks relevant follow-up questions — probing deeper when you\'re vague, moving on when you\'ve nailed it.',
  },
  {
    icon: '📊',
    title: 'Scoring & analytics',
    desc: 'Each answer gets a detailed score: relevance, depth, clarity, personal examples, and alignment with scholarship values. Track improvement over time.',
  },
  {
    icon: '💡',
    title: 'Model answers',
    desc: 'After each question, see a model answer that would score top marks. Learn the structure, tone, and level of detail expected.',
  },
  {
    icon: '📝',
    title: 'Written exam prep',
    desc: 'Some scholarships include written tests or essay exams. Practice timed writing with AI evaluation on structure, argument quality, and language.',
  },
  {
    icon: '🌍',
    title: 'Cultural context',
    desc: 'Interview norms vary by country. Scholara prepares you for the cultural context — formality level, expected body language, and communication style.',
  },
];

const SCHOLARSHIPS = [
  { name: 'DAAD', format: 'Panel interview + motivation letter review', prep: 'Research-focused questions, development goals alignment' },
  { name: 'Chevening', format: 'Competency-based panel interview', prep: 'Leadership examples, networking scenarios, UK return plan' },
  { name: 'MEXT', format: ' Embassy interview + written exam', prep: 'Japanese study plans, research proposal defense, language ability' },
  { name: 'Fulbright', format: 'Committee interview', prep: 'Cultural exchange vision, project feasibility, ambassador qualities' },
  { name: 'GKS', format: 'Embassy or university interview', prep: 'Korean language plans, academic goals, cultural adaptation' },
  { name: 'Commonwealth', format: 'Panel interview', prep: 'Development impact, home country contribution, leadership proof' },
];

export default function InterviewPrepContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[720px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5b942] animate-pulse" />
            Coming soon
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            Walk into your interview <span className="text-[#f5b942]">already prepared.</span>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[540px] mx-auto leading-relaxed mb-6">
            AI-powered mock interviews tailored to each scholarship. Practice with realistic questions, get scored on every answer, and refine until you&apos;re confident.
          </p>
          <Link href="/signup" className="sr-border-beam inline-block relative text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-7 py-3.5 hover:bg-[#d4972e] hover:text-white transition">
            Get early access →
          </Link>
        </motion.div>
      </header>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">How it works</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Practice makes confident.</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {HOW_IT_WORKS.map((s, i) => (
              <motion.div key={s.num} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-6" {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.1 }}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm mb-3 ${i === 3 ? 'bg-[#f5b942] text-[#1a1a1a]' : 'bg-[#1a1a1a] text-[#f5b942]'}`}>{s.num}</span>
                <h3 className="font-bold text-base mb-2">{s.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">Capabilities</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Not generic mock interviews.</h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-[520px] mx-auto">Scholarship-specific prep that knows what each panel is looking for.</p>
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

      {/* ═══ SCHOLARSHIP-SPECIFIC ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[760px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">Tailored prep</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Every scholarship has its own interview.</h2>
            <p className="text-sm text-gray-600">We prepare you for the specific format and expectations of each award.</p>
          </motion.div>
          <div className="space-y-3">
            {SCHOLARSHIPS.map((s, i) => (
              <motion.div key={s.name} className="bg-white rounded-xl border border-[#f0ebe0] p-4 sm:p-5" {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.04 }}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="text-sm font-black text-[#f5b942] w-24 flex-shrink-0">{s.name}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#1a1a1a]">{s.format}</p>
                    <p className="text-xs text-gray-500">{s.prep}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <motion.div className="max-w-[680px] mx-auto text-center" {...fadeUp}>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4">Be ready before they ask.</h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8">Sign up for early access to AI interview prep.</p>
          <Link href="/signup" className="sr-border-beam inline-block relative text-base font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-9 py-4 hover:bg-[#d4972e] hover:text-white transition">
            Get early access →
          </Link>
        </motion.div>
      </section>
    </LandingShell>
  );
}
