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

const CAPABILITIES = [
  {
    icon: '✍️',
    title: 'Drafts your essays',
    desc: 'Motivation letters, statements of purpose, research proposals — Scholara drafts them from your profile, tailored to each award\'s actual criteria. You edit and approve.',
    example: '"Draft a motivation letter for DAAD EPOS based on my profile"',
  },
  {
    icon: '⚖️',
    title: 'Compares awards side by side',
    desc: 'Stipend, tuition coverage, duration, post-study visa terms, health insurance — Scholara lays it all out so you can pick the strongest offer.',
    example: '"Compare DAAD vs Chevening for my profile"',
  },
  {
    icon: '🎯',
    title: 'Checks your eligibility',
    desc: 'Not sure if you qualify? Scholara reads the fine print. It checks nationality restrictions, GPA thresholds, language requirements, and degree compatibility.',
    example: '"Am I eligible for MEXT with a 3.2 GPA?"',
  },
  {
    icon: '📋',
    title: 'Preps your documents',
    desc: 'Per-award checklists with what you need, when you need it, and how to get it. Transcripts, certificates, language tests, recommendation letters.',
    example: '"What documents do I need for Chevening?"',
  },
  {
    icon: '💡',
    title: 'Answers any question',
    desc: '"Can I work part-time on DAAD?" "How strong is my SOP for MEXT?" "What\'s the acceptance rate for GKS?" Ask anything — Scholara knows.',
    example: '"Can I bring my family on a Chevening visa?"',
  },
  {
    icon: '🗺️',
    title: 'Builds your roadmap',
    desc: 'Get a step-by-step plan to strengthen your application: what to improve, which deadlines to hit, and in what order to apply.',
    example: '"Create a roadmap for my top 3 scholarship matches"',
  },
];

const CONVERSATION = [
  { role: 'user', text: 'My top match is DAAD at 97%. What should I do next?' },
  { role: 'scholara', text: 'Great match! Your profile aligns strongly with DAAD EPOS criteria — especially your renewable energy research and German language skills. Next steps:\n\n1. Draft your motivation letter (I can write the first version)\n2. Request a recommendation letter from your thesis advisor\n3. Get your transcripts certified\n\nWant me to start with the motivation letter?', actions: ['✍ Draft letter', '📋 Full checklist'] },
  { role: 'user', text: 'Yes, draft the letter' },
  { role: 'scholara', text: 'Here\'s your first draft, based on your profile and DAAD\'s actual criteria:\n\n---\nDear Selection Committee,\n\nI am writing to apply for the DAAD EPOS scholarship in Renewable Energy Systems at TU Berlin. With a B.Sc. in Electrical Engineering (GPA: 3.8/4.0) and two years of research experience in solar grid integration at [Institution], I am committed to advancing sustainable energy solutions in developing economies...\n\n---\n\nI\'ve highlighted your research experience and aligned it with DAAD\'s focus on "development-related postgraduate studies." Want me to adjust the tone, add more detail to any section, or rewrite the conclusion?', actions: ['📝 Rewrite intro', '➕ Add research detail', '📥 Export PDF'] },
];

export default function AiCoachContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[720px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5b942] animate-pulse" />
            Always on
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            Your personal <span className="text-[#f5b942]">scholarship advisor.</span>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[540px] mx-auto leading-relaxed mb-6">
            Scholara knows your profile, your matches, and every deadline. It drafts essays, compares awards, checks eligibility, and answers any question — 24/7.
          </p>
          <Link href="/signup" className="sr-border-beam inline-block relative text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-7 py-3.5 hover:bg-[#d4972e] hover:text-white transition">
            Talk to Scholara →
          </Link>
        </motion.div>
      </header>

      {/* ═══ LIVE CONVERSATION ═══ */}
      <section className="px-4 sm:px-6 pb-12">
        <motion.div className="max-w-[640px] mx-auto" {...fadeUp}>
          <div className="sr-spotlight relative bg-white rounded-3xl border border-[#f0ebe0] p-1 shadow-[0_30px_80px_-20px_rgba(212,151,46,0.25)]">
            <div className="bg-[#fdfbf7] rounded-[22px] p-4 sm:p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="relative w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#f5b942] text-sm">✦</span>
                  <span className="absolute -bottom-0 -right-0 w-3 h-3 rounded-full bg-green-400 border-2 border-[#fdfbf7]" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">Scholara</p>
                  <p className="text-[11px] text-green-600 font-medium">● online now</p>
                </div>
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {CONVERSATION.map((msg, i) => (
                  <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`rounded-2xl px-4 py-2.5 text-sm max-w-[85%] whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-[#f5b942] text-[#1a1a1a] rounded-tr-sm font-medium'
                        : 'bg-white border border-[#f0ebe0] rounded-tl-sm'
                    }`}>
                      {msg.text}
                      {'actions' in msg && msg.actions && (
                        <div className="mt-2.5 flex gap-2 flex-wrap">
                          {msg.actions.map((a) => (
                            <span key={a} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f5b942]/15 text-[#d4972e] cursor-pointer">{a}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ═══ CAPABILITIES ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">What Scholara can do</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Six ways Scholara helps you win.</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {CAPABILITIES.map((c, i) => (
              <motion.div key={c.title} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)]" {...fadeUp} transition={{ ...fadeUp.transition, delay: (i % 3) * 0.08 }}>
                <div className="w-11 h-11 rounded-xl bg-[#f5b942]/10 flex items-center justify-center text-xl mb-4">{c.icon}</div>
                <h3 className="font-bold text-base sm:text-lg mb-2">{c.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-3">{c.desc}</p>
                <p className="text-xs text-gray-400 italic">&ldquo;{c.example}&rdquo;</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <motion.div className="max-w-[680px] mx-auto text-center" {...fadeUp}>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4">Ask Scholara anything.</h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8">Your personal advisor, available 24/7. Free to start.</p>
          <Link href="/signup" className="sr-border-beam inline-block relative text-base font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-9 py-4 hover:bg-[#d4972e] hover:text-white transition">
            Talk to Scholara →
          </Link>
        </motion.div>
      </section>
    </LandingShell>
  );
}
