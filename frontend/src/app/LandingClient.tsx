'use client';

// / — landing page.
//
// V7 "Match-First" layout.
// Message priority: AI matching (#1) → Scholara agent (#2) → features (#3) → proof (#4)
//
// UI DNA:
//   - V6 bento grid + count-up stats + numbered steps
//   - V4 floating pill nav + spotlight + border-beam + chat interface
//   - Warm golden + white palette (#fdfbf7 base, #f5b942 gold, #f0ebe0 dividers)
//
// Mobile-first responsive: every section scales from 1-col mobile to multi-col desktop.
//
// Flow wiring:
//   - "Sign in" → /login
//   - "Start free" / "See your matches" → /signup
//   - If already authed → redirect to /scholarships

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import './landing.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Reveal animation preset ────────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
};

// ── Content data ───────────────────────────────────────────────────
const MATCHES = [
  { name: 'DAAD EPOS Scholarship', location: 'Germany · Masters · Renewable Energy', amount: '€1,200/mo', funding: 'Full funding', score: 97 },
  { name: 'Chevening Scholarship', location: 'UK · Masters · Any field', amount: 'Full cost', funding: 'Tuition + stipend', score: 91 },
  { name: 'MEXT Scholarship', location: 'Japan · Research / Masters', amount: '¥117k/mo', funding: 'Full funding', score: 84 },
  { name: 'GKS Scholarship', location: 'South Korea · Masters', amount: '₩1.6M/mo', funding: 'Full funding', score: 79, faded: true },
];

const MATCH_STEPS = [
  { num: '01', label: 'Profile', title: 'You build your profile', desc: 'Degree level, field, research interests, GPA, target countries, language scores. Four minutes, one form.' },
  { num: '02', label: 'Score', title: 'The engine scores fit', desc: 'Semantic AI reads your research interests against each award\u2019s criteria. Rule-based filters check eligibility. Every award gets a 0\u2013100 fit score.' },
  { num: '03', label: 'Rank', title: 'You get a ranked list', desc: 'Top 5 matches with scores, amounts, deadlines, and why each fits. No more scrolling 47 sites \u2014 your best matches, ranked.' },
];

const ADVISOR_POINTS = [
  { title: 'Drafts essays', desc: 'tailored to each award \u2014 motivation letters, SOPs, research proposals.' },
  { title: 'Compares awards', desc: 'side by side \u2014 stipend, tuition, duration, visa terms.' },
  { title: 'Answers any question', desc: '\u201CCan I work on DAAD?\u201D \u201CStrong SOP for MEXT?\u201D Any hour.' },
];

const FEATURES = [
  { icon: '\uD83D\uDD14', title: 'Deadline tracking', desc: 'Every saved award gets a 14/7/2-day reminder chain. Email + in-app. You won\u2019t miss another deadline.' },
  { icon: '\u2696', title: 'Award comparison', desc: 'Stipend, tuition, duration, post-study visa \u2014 side by side. Pick the strongest offer, not the loudest.' },
  { icon: '\uD83D\uDCCB', title: 'Doc checklist', desc: 'Transcripts, CV, certificates, language scores \u2014 per award. Every box checked before submit.' },
  { icon: '\uD83D\uDCAC', title: 'Rec letter coach', desc: 'Structured briefs + talking points for your referees, tailored to each award. Letters that actually say something.' },
  { icon: '\uD83D\uDCCA', title: 'Application dashboard', desc: 'Every award, every draft, every deadline in one place. Track status from saved to submitted to accepted.' },
  { icon: '\uD83C\uDF10', title: '100+ awards indexed', desc: 'DAAD, Chevening, MEXT, Fulbright, Commonwealth, GKS, Erasmus+, Rhodes & more. New awards added monthly.' },
];

const PROOF_STATS: { target: number; prefix?: string; suffix?: string; label: string; cls: string }[] = [
  { target: 2400, suffix: '+', label: 'students matched', cls: 'text-[#f5b942]' },
  { target: 912, suffix: '', label: 'scholars in 2025', cls: 'text-[#d4972e]' },
  { target: 38, suffix: '%', label: 'offer rate (full pipeline)', cls: 'text-[#1a1a1a]' },
  { target: 114, prefix: '~', label: 'hrs saved per app', cls: 'text-[#f5b942]' },
];

const SCHOLARS = [
  { initial: 'A', name: 'Aisha', award: 'DAAD \u00B7 DE', bg: 'bg-[#f5b942]', text: 'text-white' },
  { initial: 'K', name: 'Kwame', award: 'Chevening \u00B7 UK', bg: 'bg-[#d4972e]', text: 'text-white' },
  { initial: 'Z', name: 'Zainab', award: 'MEXT \u00B7 JP', bg: 'bg-[#1a1a1a]', text: 'text-[#f5b942]' },
];

const TESTIMONIALS = [
  {
    initial: 'A', name: 'Aisha M.', detail: 'Nigeria \u2192 DAAD EPOS, Germany',
    bg: 'bg-[#f5b942]',
    quote: 'The match score said 97%. I almost didn\u2019t believe it. But every criterion lined up. Scholara drafted the letter, I submitted, got it.',
  },
  {
    initial: 'Z', name: 'Zainab I.', detail: 'Egypt \u2192 MEXT, Japan',
    bg: 'bg-[#1a1a1a]', textGold: true,
    quote: 'Matched at 84%. Scholara explained why it fit even though I\u2019d never considered Japan. Trusted the score. Now I\u2019m in Tokyo.',
  },
];

const NAV_LINKS = [
  { href: '/scholarships/category/fully-funded', label: 'Scholarships' },
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/about', label: 'About' },
];

// ── Match ring (SVG progress) ──────────────────────────────────────
function MatchRing({ percent, size = 'md' }: { percent: number; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'w-9 h-9 sm:w-10 sm:h-10' : 'w-8 h-8';
  const fontSize = size === 'md' ? 'text-[10px]' : 'text-[9px]';
  return (
    <div className={`relative ${dim} flex-shrink-0`}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f0ebe0" strokeWidth="3" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f5b942" strokeWidth="3" strokeDasharray={`${percent} 100`} strokeLinecap="round" />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center ${fontSize} font-black text-[#1a1a1a]`}>
        {percent}%
      </span>
    </div>
  );
}

// ── Count-up number (IntersectionObserver + rAF) ───────────────────
function CountUp({
  target,
  prefix = '',
  suffix = '',
  className,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [val, setVal] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          const steps = 40;
          const stepVal = target / steps;
          let current = 0;
          const tick = () => {
            current += stepVal;
            if (current >= target) {
              setVal(target);
              return;
            }
            setVal(Math.floor(current));
            requestAnimationFrame(tick);
          };
          tick();
          obs.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, started]);

  return (
    <span ref={ref} className={`${className ?? ''} tabular-nums`}>
      {prefix}
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function LandingClient() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // Auth check — if already logged in, skip the pitch.
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
      <div className="min-h-screen flex items-center justify-center bg-[#fdfbf7]">
        <div className="animate-pulse text-gray-500 font-medium text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1a1a1a] overflow-x-hidden">
      {/* ═══ FLOATING NAV (V4 DNA) ═══ all links visible, button has real width ═══ */}
      <nav className="fixed left-1/2 -translate-x-1/2 z-50 bg-white/80 backdrop-blur-xl border border-[#f0ebe0] rounded-full flex items-center shadow-[0_8px_24px_-8px_rgba(0,0,0,0.08)] w-max max-w-[calc(100vw-1rem)] top-[clamp(0.5rem,0.4rem+0.3vw,1rem)] px-[clamp(0.5rem,0.25rem+0.6vw,1rem)] py-[clamp(0.25rem,0.2rem+0.2vw,0.5rem)] gap-[clamp(0.25rem,0.125rem+0.5vw,0.75rem)]">
        <Link href="/" className="flex items-center flex-shrink-0 gap-[clamp(0.25rem,0.2rem+0.3vw,0.5rem)] px-[clamp(0.125rem,0.05rem+0.3vw,0.5rem)]">
          <img src="/images/logo-light.jpg" alt="ScholarshipRight" className="h-[clamp(1.25rem,0.5rem+1vw,2rem)] w-[clamp(1.25rem,0.5rem+1vw,2rem)] rounded-lg object-contain" />
          <span className="text-sm font-extrabold hidden sm:block">
            Scholarship<span className="text-[#f5b942]">Right</span>
          </span>
        </Link>
        <div className="w-px h-[clamp(1rem,0.7rem+0.4vw,1.25rem)] bg-[#f0ebe0] mx-[clamp(0.125rem,0.05rem+0.2vw,0.5rem)] hidden sm:block" />
        <div className="flex items-center gap-[clamp(0.25rem,0.125rem+0.5vw,0.75rem)]">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-[clamp(0.125rem,0.05rem+0.7vw,0.75rem)] py-[clamp(0.25rem,0.2rem+0.2vw,0.375rem)] text-[clamp(0.625rem,0.55rem+0.6vw,0.875rem)] font-medium text-gray-600 hover:text-[#1a1a1a] rounded-full hover:bg-[#fdfbf7] transition whitespace-nowrap"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <Link
          href="/signup"
          className="ml-[clamp(0.125rem,0.05rem+0.3vw,0.5rem)] flex-shrink-0 inline-flex items-center justify-center w-[4.5rem] h-[1.75rem] sm:w-[6.5rem] sm:h-[2.25rem] md:w-[8rem] md:h-[2.5rem] text-[0.625rem] sm:text-sm md:text-base font-semibold text-[#1a1a1a] bg-[#f5b942] rounded-full hover:bg-[#d4972e] hover:text-white transition whitespace-nowrap"
        >
          Start free
        </Link>
      </nav>

      {/* ═══ HERO — AI MATCHING IS THE LEAD ══════════════════════════ */}
      <header id="matching" className="relative px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16 overflow-hidden">
        {/* headline */}
        <motion.div
          className="text-center max-w-[820px] mx-auto mb-10 sm:mb-12"
          {...fadeUp}
        >
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5b942] animate-pulse" />
            AI Matching &amp; Scoring · The core engine
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] lg:text-[64px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            AI scores every scholarship against{' '}
            <span className="sr-shimmer">your profile.</span>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[560px] sm:max-w-[580px] mx-auto leading-relaxed mb-6 sm:mb-7 px-2 sm:px-0">
            Not a list of links. Not a keyword search. Our matching engine reads your academic profile, research interests, and target destinations — then ranks 100+ fully funded awards by real fit. In 30 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="sr-border-beam relative text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-7 py-3.5 hover:bg-[#d4972e] hover:text-white transition w-full sm:w-auto text-center"
            >
              See your matches →
            </Link>
            <a
              href="#how-match"
              className="text-sm font-medium text-[#1a1a1a] px-6 py-3.5 rounded-full border border-[#f0ebe0] hover:border-[#f5b942] transition w-full sm:w-auto text-center"
            >
              How matching works
            </a>
          </div>
        </motion.div>

        {/* BENTO GRID — matching dashboard is the hero tile */}
        <motion.div
          className="max-w-[1180px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4"
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
        >
          {/* BIG TILE: matching dashboard */}
          <div className="sr-spotlight col-span-2 md:col-span-2 md:row-span-2 bg-white rounded-2xl border border-[#f0ebe0] p-4 sm:p-6 flex flex-col min-h-[300px] sm:min-h-[340px] hover:shadow-[0_16px_32px_-12px_rgba(212,151,46,0.2)] transition-all duration-300 hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-4 sm:mb-5">
              <div>
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#d4972e] mb-1">Your top matches</p>
                <p className="text-[10px] sm:text-[11px] text-gray-500 hidden sm:block">Ranked by profile fit · updated live</p>
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-[#f5b942]/15 text-[#d4972e] whitespace-nowrap">5 new</span>
            </div>
            {/* match rows */}
            <div className="space-y-1.5 sm:space-y-2 flex-1">
              {MATCHES.map((m) => (
                <div
                  key={m.name}
                  className={`grid grid-cols-[1fr_auto_auto] gap-2 sm:gap-3 items-center p-2.5 sm:p-3 border border-[#f0ebe0] rounded-lg transition hover:border-[#f5b942] hover:bg-[#f5b942]/[0.04] ${m.faded ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="text-[12px] sm:text-[13px] font-bold text-[#1a1a1a] leading-tight truncate">{m.name}</div>
                    <div className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">{m.location}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] sm:text-[13px] font-bold text-[#d4972e] whitespace-nowrap">{m.amount}</div>
                    <div className="text-[9px] sm:text-[10px] text-gray-400 whitespace-nowrap hidden sm:block">{m.funding}</div>
                  </div>
                  <MatchRing percent={m.score} size="sm" />
                </div>
              ))}
            </div>
            <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-[#f0ebe0] flex items-center justify-between">
              <p className="text-[10px] sm:text-[11px] text-gray-500">+ 96 more scored</p>
              <Link href="/scholarships" className="text-[10px] sm:text-[11px] font-bold text-[#d4972e] hover:underline">View all →</Link>
            </div>
          </div>

          {/* small tile: match accuracy */}
          <div className="bg-white rounded-2xl border border-[#f0ebe0] p-4 sm:p-5 flex flex-col justify-between min-h-[120px] sm:min-h-[130px] hover:shadow-[0_16px_32px_-12px_rgba(212,151,46,0.2)] transition-all duration-300 hover:-translate-y-0.5">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Match accuracy</p>
            <div>
              <CountUp target={94} suffix="%" className="text-3xl sm:text-4xl font-black text-[#f5b942]" />
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1">profile-fit precision</p>
            </div>
          </div>

          {/* small tile: time to match */}
          <div className="bg-[#1a1a1a] text-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between min-h-[120px] sm:min-h-[130px] hover:shadow-[0_16px_32px_-12px_rgba(212,151,46,0.2)] transition-all duration-300 hover:-translate-y-0.5">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#f5b942]">Time to match</p>
            <div>
              <CountUp target={30} suffix="s" className="text-3xl sm:text-4xl font-black" />
              <p className="text-[11px] sm:text-xs text-gray-400 mt-1">profile to ranked list</p>
            </div>
          </div>

          {/* small tile: awards indexed */}
          <div className="bg-white rounded-2xl border border-[#f0ebe0] p-4 sm:p-5 flex flex-col justify-between min-h-[120px] sm:min-h-[130px] hover:shadow-[0_16px_32px_-12px_rgba(212,151,46,0.2)] transition-all duration-300 hover:-translate-y-0.5">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Awards indexed</p>
            <div>
              <CountUp target={100} suffix="+" className="text-3xl sm:text-4xl font-black text-[#d4972e]" />
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1">fully funded, global</p>
            </div>
          </div>

          {/* small tile: countries */}
          <div className="bg-[#f5b942]/10 rounded-2xl border border-[#f5b942]/30 p-4 sm:p-5 flex flex-col justify-between min-h-[120px] sm:min-h-[130px] hover:shadow-[0_16px_32px_-12px_rgba(212,151,46,0.2)] transition-all duration-300 hover:-translate-y-0.5">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#d4972e]">Countries</p>
            <div>
              <CountUp target={18} className="text-3xl sm:text-4xl font-black text-[#1a1a1a]" />
              <p className="text-[11px] sm:text-xs text-gray-600 mt-1">DE · UK · JP · US · KR</p>
            </div>
          </div>
        </motion.div>
      </header>

      {/* ═══ HOW MATCHING WORKS — 3 steps ════════════════════════════ */}
      <section id="how-match" className="px-4 sm:px-6 py-16 sm:py-20 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">How matching works</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Not keyword search. Real understanding.</h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-[480px] sm:max-w-[520px] mx-auto px-2 sm:px-0">
              Our engine combines semantic AI with rule-based filters — so a 97% match actually means something.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
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
        </div>
      </section>

      {/* ═══ ADVISOR — SECOND FEATURE (V4 chat interface) ═════════════ */}
      <section id="advisor" className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-12 items-center">
          {/* left: message */}
          <motion.div {...fadeUp}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a1a1a] text-white mb-5 sm:mb-6">
              <span className="text-[#f5b942]">✦</span>
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider">Step 2 · Meet Scholara</span>
            </div>
            <h2 className="text-[28px] sm:text-[36px] md:text-[48px] font-black tracking-[-0.03em] leading-[1.1] sm:leading-[1.05] mb-4 sm:mb-5">
              Once you&apos;re matched, your <span className="text-[#f5b942]">AI advisor</span> takes it from there.
            </h2>
            <p className="text-base sm:text-lg text-gray-600 max-w-[480px] mb-6 sm:mb-7 leading-relaxed">
              Scholara knows your matches, your profile, and every deadline. It drafts your essays, compares awards, and preps your docs — so a 97% match actually becomes an acceptance.
            </p>
            <div className="space-y-3 sm:space-y-3.5">
              {ADVISOR_POINTS.map((p) => (
                <div key={p.title} className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[#f5b942]/15 text-[#d4972e] flex items-center justify-center text-xs font-bold flex-shrink-0">
                    ✓
                  </span>
                  <p className="text-sm text-gray-700">
                    <b>{p.title}</b> {p.desc}
                  </p>
                </div>
              ))}
            </div>
            <Link
              href="/signup"
              className="sr-border-beam inline-block relative mt-7 sm:mt-8 text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-6 py-3 hover:bg-[#d4972e] hover:text-white transition"
            >
              Talk to Scholara →
            </Link>
          </motion.div>

          {/* right: chat interface */}
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.15 }}>
            <div className="sr-spotlight relative bg-white rounded-3xl border border-[#f0ebe0] p-1 shadow-[0_30px_80px_-20px_rgba(212,151,46,0.25)]">
              <div className="bg-[#fdfbf7] rounded-[22px] p-4 sm:p-5">
                {/* chat header */}
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
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#f0ebe0]" />
                    <span className="w-2 h-2 rounded-full bg-[#f0ebe0]" />
                    <span className="w-2 h-2 rounded-full bg-[#f0ebe0]" />
                  </div>
                </div>
                {/* chat messages */}
                <div className="space-y-3">
                  <div className="sr-float flex justify-end">
                    <div className="bg-[#f5b942] text-[#1a1a1a] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm font-medium max-w-[80%]">
                      My top match is DAAD at 97%. What now?
                    </div>
                  </div>
                  <div className="sr-float sr-float-d1 flex justify-start">
                    <div className="bg-white border border-[#f0ebe0] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm max-w-[85%]">
                      Great match. Next: draft your motivation letter. I&apos;ve pulled DAAD&apos;s actual criteria — want me to write the first draft from your profile?
                      <div className="mt-2.5 flex gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f5b942]/15 text-[#d4972e] pointer-events-none">✍ Draft letter</span>
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[#f0ebe0] text-gray-600 pointer-events-none">See criteria</span>
                      </div>
                    </div>
                  </div>
                  <div className="sr-float sr-float-d2 flex justify-start">
                    <div className="bg-white border border-[#f0ebe0] rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
                      <span className="sr-typing-dot" />
                      <span className="sr-typing-dot" />
                      <span className="sr-typing-dot" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ FEATURES — THE REST OF THE PRODUCT ═══════════════════════ */}
      <section id="features" className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0]">
        <div className="max-w-[1080px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-14" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">And the rest</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3">Everything else, handled.</h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-[480px] sm:max-w-[520px] mx-auto px-2 sm:px-0">
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

      {/* ═══ PROOF — SUPPORTING EVIDENCE ══════════════════════════════ */}
      <section id="proof" className="px-4 sm:px-6 py-16 sm:py-20 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1100px] mx-auto">
          <motion.div className="text-center mb-10 sm:mb-12" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">Proof</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">It works. Here&apos;s the evidence.</h2>
          </motion.div>

          {/* stat row */}
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-4 mb-10 sm:mb-12" {...fadeUp}>
            {PROOF_STATS.map((s) => (
              <div key={s.label} className="text-center">
                <CountUp
                  target={s.target}
                  prefix={s.prefix ?? ''}
                  suffix={s.suffix ?? ''}
                  className={`text-3xl sm:text-4xl md:text-5xl font-black ${s.cls}`}
                />
                <p className="text-[11px] sm:text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </motion.div>

          {/* avatar stack */}
          <motion.div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8 sm:mb-10" {...fadeUp}>
            {SCHOLARS.map((s) => (
              <div key={s.name} className="flex items-center gap-2 bg-white rounded-full border border-[#f0ebe0] pl-1 pr-3 sm:pr-4 py-1">
                <div className={`w-8 h-8 rounded-full ${s.bg} flex items-center justify-center text-xs font-bold ${s.text}`}>
                  {s.initial}
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight">{s.name}</p>
                  <p className="text-[10px] text-gray-500">{s.award}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 bg-[#fdfbf7] rounded-full border border-dashed border-[#f5b942] pl-1 pr-3 sm:pr-4 py-1">
              <div className="w-8 h-8 rounded-full bg-[#f5b942]/20 flex items-center justify-center text-xs font-bold text-[#d4972e]">+</div>
              <div>
                <p className="text-xs font-bold leading-tight">2,397 more</p>
                <p className="text-[10px] text-gray-500">scholars</p>
              </div>
            </div>
          </motion.div>

          {/* testimonials */}
          <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-4" {...fadeUp}>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full ${t.bg} flex items-center justify-center font-bold ${t.textGold ? 'text-[#f5b942]' : 'text-white'}`}>
                    {t.initial}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.detail}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ CTA ══════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24">
        <motion.div className="max-w-[680px] mx-auto text-center" {...fadeUp}>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight mb-4">
            Get your matches in 30 seconds.
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-8 sm:mb-9 px-2 sm:px-0">
            Build your profile. See your top 5. Free — no card, no waiting.
          </p>
          <Link
            href="/signup"
            className="sr-border-beam inline-block relative text-base font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-9 py-4 hover:bg-[#d4972e] hover:text-white transition"
          >
            See your matches →
          </Link>
          <p className="text-xs text-gray-400 mt-5">
            Already matched?{' '}
            <Link href="/login" className="text-[#d4972e] font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </section>

      {/* ═══ FOOTER ═══════════════════════════════════════════════════ */}
      <footer className="border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-12 sm:py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
            {/* Brand column */}
            <div className="col-span-2 md:col-span-2">
              <Link href="/" className="flex items-center gap-2.5 mb-4">
                <img src="/images/logo-light.jpg" alt="ScholarshipRight" className="h-9 w-9 rounded-lg object-contain" />
                <span className="text-lg font-extrabold">
                  Scholarship<span className="text-[#f5b942]">Right</span>
                </span>
              </Link>
              <p className="text-sm text-gray-600 max-w-[280px] leading-relaxed mb-5">
                AI matching + advisor for fully funded scholarships. Stop scrolling lists. Start getting matched.
              </p>
              <div className="flex gap-2">
                <span className="w-9 h-9 rounded-full border border-[#f0ebe0] flex items-center justify-center text-gray-400 opacity-50 cursor-not-allowed text-sm font-bold" title="Coming soon" aria-label="X (coming soon)">
                  𝕏
                </span>
                <span className="w-9 h-9 rounded-full border border-[#f0ebe0] flex items-center justify-center text-gray-400 opacity-50 cursor-not-allowed text-xs font-bold" title="Coming soon" aria-label="LinkedIn (coming soon)">
                  in
                </span>
                <span className="w-9 h-9 rounded-full border border-[#f0ebe0] flex items-center justify-center text-gray-400 opacity-50 cursor-not-allowed text-sm" title="Coming soon" aria-label="Instagram (coming soon)">
                  ◯
                </span>
              </div>
            </div>
            {/* Product */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Product</h4>
              <ul className="space-y-2.5">
                <li><Link href="/how-it-works" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">How it works</Link></li>
                <li><Link href="/how-it-works#matching" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">AI Matching</Link></li>
                <li><Link href="/how-it-works#advisor" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Scholara Advisor</Link></li>
                <li><Link href="/features" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Features</Link></li>
              </ul>
            </div>
            {/* Resources */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Resources</h4>
              <ul className="space-y-2.5">
                <li><Link href="/scholarships/category/fully-funded" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Scholarship database</Link></li>
                <li><Link href="/faq" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">FAQ</Link></li>
                <li><span className="text-sm text-gray-400 cursor-not-allowed" title="Coming soon">Blog</span></li>
                <li><Link href="/faq" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Help center</Link></li>
              </ul>
            </div>
            {/* Company */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Company</h4>
              <ul className="space-y-2.5">
                <li><Link href="/about" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">About</Link></li>
                <li><Link href="/contact" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Contact</Link></li>
                <li><Link href="/privacy" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Privacy</Link></li>
                <li><Link href="/terms" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Terms</Link></li>
              </ul>
            </div>
          </div>
          {/* Bottom bar */}
          <div className="pt-6 border-t border-[#f0ebe0] flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-gray-500">© 2026 ScholarshipRight. All rights reserved.</p>
            <p className="text-xs text-gray-400">Made for students who deserve fully funded.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
