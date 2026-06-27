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

const MATCH_STEPS = [
  { num: '01', label: 'Profile', title: 'You build your profile', desc: 'Degree level, field, research interests, GPA, target countries, language scores. Four minutes, one form.' },
  { num: '02', label: 'Score', title: 'The engine scores fit', desc: 'Semantic AI reads your research interests against each award\'s criteria. Rule-based filters check eligibility. Every award gets a 0–100 fit score.' },
  { num: '03', label: 'Rank', title: 'You get a ranked list', desc: 'Top 5 matches with scores, amounts, deadlines, and why each fits. No more scrolling 47 sites — your best matches, ranked.' },
];

const ADVISOR_POINTS = [
  { title: 'Drafts essays', desc: 'tailored to each award — motivation letters, SOPs, research proposals.' },
  { title: 'Compares awards', desc: 'side by side — stipend, tuition, duration, visa terms.' },
  { title: 'Answers any question', desc: '"Can I work on DAAD?" "Strong SOP for MEXT?" Any hour.' },
  { title: 'Preps your docs', desc: 'transcripts, CV, certificates, language scores — per award checklist.' },
  { title: 'Tracks deadlines', desc: '14/7/2-day reminder chains. Email + in-app. You won\'t miss another.' },
  { title: 'Monitors your apps', desc: 'every award, every draft, every deadline in one dashboard.' },
];

const FEATURES = [
  { icon: '🔔', title: 'Deadline tracking', desc: 'Every saved award gets a 14/7/2-day reminder chain. Email + in-app. You won\'t miss another deadline.' },
  { icon: '⚖', title: 'Award comparison', desc: 'Stipend, tuition, duration, post-study visa — side by side. Pick the strongest offer, not the loudest.' },
  { icon: '📋', title: 'Doc checklist', desc: 'Transcripts, CV, certificates, language scores — per award. Every box checked before submit.' },
  { icon: '💬', title: 'Rec letter coach', desc: 'Structured briefs + talking points for your referees, tailored to each award. Letters that actually say something.' },
  { icon: '📊', title: 'Application dashboard', desc: 'Every award, every draft, every deadline in one place. Track status from saved to submitted to accepted.' },
  { icon: '🌐', title: '100+ awards indexed', desc: 'DAAD, Chevening, MEXT, Fulbright, Commonwealth, GKS, Erasmus+, Rhodes & more. New awards added monthly.' },
];

const PROOF_STATS = [
  { num: '2,400+', label: 'students matched' },
  { num: '94%', label: 'match accuracy' },
  { num: '30s', label: 'to get matched' },
  { num: '114hrs', label: 'saved per app' },
];

export default function HowItWorksContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[720px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5b942] animate-pulse" />
            How it works
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            From profile to <span className="text-[#f5b942]">acceptance</span> in three steps.
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[520px] mx-auto leading-relaxed">
            ScholarshipRight combines AI matching with a personal advisor to take you from &ldquo;I need a scholarship&rdquo; to &ldquo;I got it.&rdquo;
          </p>
        </motion.div>
      </header>

      {/* ═══ STEP 1: AI MATCHING ═══ */}
      <section id="matching" className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a1a1a] text-white mb-4">
              <span className="text-[#f5b942] text-xs font-bold">✦</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider">Step 1</span>
            </span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">AI matching that actually works.</h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-[480px] mx-auto px-2 sm:px-0">
              Our engine combines semantic AI with rule-based filters — so a 97% match actually means something.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-12">
            {MATCH_STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7"
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.1 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${i === 2 ? 'bg-[#f5b942] text-[#1a1a1a]' : 'bg-[#1a1a1a] text-[#f5b942]'}`}>
                    {step.num}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{step.label}</span>
                </div>
                <h3 className="font-bold text-base sm:text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
          {/* Matching stats */}
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4" {...fadeUp}>
            {PROOF_STATS.map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 text-center">
                <p className="text-2xl sm:text-3xl font-black text-[#f5b942]">{s.num}</p>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ STEP 2: SCHOLARA ADVISOR ═══ */}
      <section id="advisor" className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a1a1a] text-white mb-4">
              <span className="text-[#f5b942] text-xs font-bold">✦</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider">Step 2</span>
            </span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Meet Scholara, your AI advisor.</h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-[520px] mx-auto px-2 sm:px-0">
              Once matched, Scholara takes over. It knows your profile, your matches, and every deadline.
            </p>
          </motion.div>

          {/* Chat preview */}
          <motion.div className="max-w-[640px] mx-auto mb-12" {...fadeUp}>
            <div className="sr-spotlight relative bg-white rounded-3xl border border-[#f0ebe0] p-1 shadow-[0_30px_80px_-20px_rgba(212,151,46,0.25)]">
              <div className="bg-[#fdfbf7] rounded-[22px] p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="relative w-9 h-9 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#f5b942] text-sm">✦</span>
                      <span className="absolute -bottom-0 -right-0 w-3 h-3 rounded-full bg-green-400 border-2 border-[#fdfbf7]" />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">Scholara</p>
                      <p className="text-[11px] text-green-600 font-medium">● online now</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <div className="bg-[#f5b942] text-[#1a1a1a] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm font-medium max-w-[80%]">
                      My top match is DAAD at 97%. What now?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-white border border-[#f0ebe0] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm max-w-[85%]">
                      Great match. Next: draft your motivation letter. I&apos;ve pulled DAAD&apos;s actual criteria — want me to write the first draft from your profile?
                      <div className="mt-2.5 flex gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f5b942]/15 text-[#d4972e]">✍ Draft letter</span>
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[#f0ebe0] text-gray-600">See criteria</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* What Scholara does */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {ADVISOR_POINTS.map((p, i) => (
              <motion.div
                key={p.title}
                className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)]"
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: (i % 3) * 0.08 }}
              >
                <div className="w-9 h-9 rounded-lg bg-[#f5b942]/10 flex items-center justify-center text-sm font-bold text-[#d4972e] mb-3">
                  ✓
                </div>
                <h3 className="font-bold text-sm sm:text-base mb-1">{p.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STEP 3: FEATURES ═══ */}
      <section id="features" className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a1a1a] text-white mb-4">
              <span className="text-[#f5b942] text-xs font-bold">✦</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider">Step 3</span>
            </span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Everything else, handled.</h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-[520px] mx-auto px-2 sm:px-0">
              Matching and advising are the core. These make sure nothing else slips.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)]"
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: (i % 3) * 0.08 }}
              >
                <div className="w-11 h-11 rounded-xl bg-[#f5b942]/10 flex items-center justify-center text-xl mb-4">
                  {f.icon}
                </div>
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
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4">
            See how it works for you.
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8 sm:mb-9 px-2 sm:px-0">
            Build your profile. Get matched in 30 seconds. Free — no card, no waiting.
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
