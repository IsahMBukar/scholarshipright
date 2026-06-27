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
    icon: '🔍',
    title: 'AI Resume Analysis',
    desc: 'Upload any resume format (PDF, DOCX). Our AI parses every section, detects issues — missing dates, weak bullets, formatting gaps, missing keywords — and grades severity as urgent, severe, or likely.',
    tags: ['PDF upload', 'Auto-parse', 'Issue detection'],
  },
  {
    icon: '✨',
    title: 'AI-Powered Rewriting',
    desc: 'Weak bullet points? Vague descriptions? Highlight any section and let AI rewrite it with stronger action verbs, quantified impact, and scholarship-relevant keywords. You approve every change.',
    tags: ['One-click rewrite', 'Before/after diff', 'You control'],
  },
  {
    icon: '📊',
    title: 'Completeness Scoring',
    desc: 'Your resume gets a completeness score based on your education level. A bachelor\'s applicant needs different depth than a PhD candidate. The score adapts to your level.',
    tags: ['Level-aware', 'Section checklist', 'Progress tracking'],
  },
  {
    icon: '📥',
    title: 'PDF Export',
    desc: 'Export your polished resume as a clean, professional PDF. Optimized for scholarship applications — proper formatting, ATS-friendly structure, and academic conventions.',
    tags: ['Clean PDF', 'ATS-friendly', 'Academic format'],
  },
];

const SECTIONS = [
  { icon: '👤', name: 'Contact & basics' },
  { icon: '🎓', name: 'Education history' },
  { icon: '💼', name: 'Work experience' },
  { icon: '🔬', name: 'Research & publications' },
  { icon: '📁', name: 'Projects' },
  { icon: '🗣', name: 'Languages & skills' },
  { icon: '🏆', name: 'Awards & certifications' },
  { icon: '👥', name: 'References' },
];

const WORKFLOW = [
  { num: '01', title: 'Upload', desc: 'Drop your existing resume (PDF/DOCX) or start from scratch. AI auto-fills your profile sections.' },
  { num: '02', title: 'Analyze', desc: 'AI scans every section, flags issues, and gives you a completeness score with specific fixes.' },
  { num: '03', title: 'Improve', desc: 'Accept AI rewrites, fill in gaps, and watch your score climb. Every change is previewed before applying.' },
  { num: '04', title: 'Export', desc: 'Download a polished PDF ready for scholarship applications. Clean formatting, academic conventions.' },
];

export default function ResumeBuilderContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[720px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            AI-powered
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            Build a resume that <span className="text-[#f5b942]">wins</span> scholarships.
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[540px] mx-auto leading-relaxed mb-6">
            Upload your resume. AI finds every issue, rewrites weak sections, and exports a polished PDF. Built specifically for scholarship applications — not job boards.
          </p>
          <Link href="/signup" className="sr-border-beam inline-block relative text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-7 py-3.5 hover:bg-[#d4972e] hover:text-white transition">
            Build your resume →
          </Link>
        </motion.div>
      </header>

      {/* ═══ WORKFLOW ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-20 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">How it works</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">Upload to polished in four steps.</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {WORKFLOW.map((s, i) => (
              <motion.div key={s.num} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-6" {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.1 }}>
                <span className="w-8 h-8 rounded-lg bg-[#1a1a1a] text-[#f5b942] flex items-center justify-center font-black text-sm mb-3">{s.num}</span>
                <h3 className="font-bold text-base mb-2">{s.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CAPABILITIES ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">Capabilities</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">AI that actually improves your resume.</h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-[520px] mx-auto">Not just spell-check. Real analysis, real rewriting, real scoring.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {CAPABILITIES.map((c, i) => (
              <motion.div key={c.title} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)]" {...fadeUp} transition={{ ...fadeUp.transition, delay: (i % 2) * 0.1 }}>
                <div className="w-11 h-11 rounded-xl bg-[#f5b942]/10 flex items-center justify-center text-xl mb-4">{c.icon}</div>
                <h3 className="font-bold text-base sm:text-lg mb-2">{c.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-3">{c.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f5b942]/10 text-[#d4972e] border border-[#f5b942]/20">{t}</span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTIONS ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-20 border-t border-[#f0ebe0]">
        <div className="max-w-[760px] mx-auto">
          <motion.div className="text-center mb-8 sm:mb-10" {...fadeUp}>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-3">Every section covered.</h2>
            <p className="text-sm text-gray-600">Your resume is parsed into structured sections. Each one gets analyzed and scored.</p>
          </motion.div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SECTIONS.map((s, i) => (
              <motion.div key={s.name} className="bg-white rounded-xl border border-[#f0ebe0] p-4 text-center" {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.04 }}>
                <span className="text-2xl mb-2 block">{s.icon}</span>
                <p className="text-xs font-semibold text-gray-700">{s.name}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <motion.div className="max-w-[680px] mx-auto text-center" {...fadeUp}>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4">Your resume, perfected.</h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8">Upload, analyze, improve, export. Free to start.</p>
          <Link href="/signup" className="sr-border-beam inline-block relative text-base font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-9 py-4 hover:bg-[#d4972e] hover:text-white transition">
            Build your resume →
          </Link>
        </motion.div>
      </section>
    </LandingShell>
  );
}
