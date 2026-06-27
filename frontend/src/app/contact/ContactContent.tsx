'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import LandingShell from '@/components/LandingShell';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
};

const CONTACT_METHODS = [
  {
    icon: '✉️',
    title: 'Email',
    desc: 'support@scholarshipright.com',
    detail: 'We respond within 24 hours on business days.',
  },
  {
    icon: '💬',
    title: 'In-app chat',
    desc: 'Talk to Scholara',
    detail: 'Our AI advisor can answer most questions instantly. For human support, just ask.',
  },
  {
    icon: '𝕏',
    title: 'Social',
    desc: '@ScholarshipRight',
    detail: 'Follow us for updates, new awards, and scholarship tips.',
  },
];

const REASONS = [
  'General question',
  'Account issue',
  'Scholarship data feedback',
  'Partnership inquiry',
  'Bug report',
  'Other',
];

export default function ContactContent() {
  const [submitted, setSubmitted] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[680px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5b942] animate-pulse" />
            Get in touch
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            We&apos;d love to <span className="text-[#f5b942]">hear</span> from you.
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[480px] mx-auto leading-relaxed">
            Questions, feedback, or just want to say hi? Reach out and we&apos;ll get back to you.
          </p>
        </motion.div>
      </header>

      {/* ═══ CONTACT METHODS ═══ */}
      <section className="px-4 sm:px-6 pb-12 sm:pb-16">
        <div className="max-w-[1080px] mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {CONTACT_METHODS.map((m, i) => (
            <motion.div
              key={m.title}
              className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)]"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.1 }}
            >
              <div className="w-12 h-12 rounded-xl bg-[#f5b942]/10 flex items-center justify-center text-2xl mb-4 mx-auto">
                {m.icon}
              </div>
              <h3 className="font-bold text-base sm:text-lg mb-1">{m.title}</h3>
              <p className="text-sm font-semibold text-[#d4972e] mb-2">{m.desc}</p>
              <p className="text-sm text-gray-600 leading-relaxed">{m.detail}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ CONTACT FORM ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[640px] mx-auto">
          <motion.div className="text-center mb-8 sm:mb-10" {...fadeUp}>
            <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">Send a message</p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Fill out the form below.</h2>
          </motion.div>

          {submitted ? (
            <motion.div
              className="bg-white rounded-2xl border border-[#f0ebe0] p-8 sm:p-10 text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="w-16 h-16 rounded-full bg-[#f5b942]/10 flex items-center justify-center text-3xl mx-auto mb-4">
                ✓
              </div>
              <h3 className="text-xl font-black mb-2">Message sent!</h3>
              <p className="text-sm text-gray-600 leading-relaxed max-w-[360px] mx-auto">
                Thanks for reaching out. We&apos;ll get back to you within 24 hours.
              </p>
            </motion.div>
          ) : (
            <motion.form
              className="bg-white rounded-2xl border border-[#f0ebe0] p-6 sm:p-8 space-y-5"
              {...fadeUp}
              onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Your name"
                    className="w-full px-4 py-3 rounded-xl border border-[#f0ebe0] bg-[#fdfbf7] text-sm text-[#1a1a1a] placeholder:text-gray-400 focus:outline-none focus:border-[#f5b942] focus:ring-2 focus:ring-[#f5b942]/20 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-xl border border-[#f0ebe0] bg-[#fdfbf7] text-sm text-[#1a1a1a] placeholder:text-gray-400 focus:outline-none focus:border-[#f5b942] focus:ring-2 focus:ring-[#f5b942]/20 transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Reason</label>
                <div className="flex flex-wrap gap-2">
                  {REASONS.map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setReason(r)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                        reason === r
                          ? 'bg-[#f5b942] border-[#f5b942] text-[#1a1a1a]'
                          : 'border-[#f0ebe0] text-gray-600 hover:border-[#f5b942]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Message</label>
                <textarea
                  required
                  rows={5}
                  placeholder="Tell us what's on your mind…"
                  className="w-full px-4 py-3 rounded-xl border border-[#f0ebe0] bg-[#fdfbf7] text-sm text-[#1a1a1a] placeholder:text-gray-400 focus:outline-none focus:border-[#f5b942] focus:ring-2 focus:ring-[#f5b942]/20 transition resize-none"
                />
              </div>
              <button
                type="submit"
                className="sr-border-beam relative w-full sm:w-auto text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-8 py-3.5 hover:bg-[#d4972e] hover:text-white transition"
              >
                Send message →
              </button>
            </motion.form>
          )}
        </div>
      </section>
    </LandingShell>
  );
}
