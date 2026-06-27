'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import LandingShell from '@/components/LandingShell';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
};

const CATEGORIES = [
  {
    label: 'Getting started',
    faqs: [
      {
        q: 'What is ScholarshipRight?',
        a: 'ScholarshipRight is an AI-powered platform that matches students to fully funded international scholarships. Instead of scrolling through hundreds of listings, you build a profile and our engine ranks 100+ awards by how well they fit you — with scores from 0 to 100.',
      },
      {
        q: 'Is ScholarshipRight free?',
        a: 'Yes. Building your profile, seeing your matches, and using Scholara (our AI advisor) are all free. No credit card required to sign up.',
      },
      {
        q: 'How does the matching work?',
        a: 'Our engine combines semantic AI (it reads your research interests against each award\'s criteria) with rule-based filters (degree level, GPA, country, language scores). Every scholarship gets a 0–100 fit score. A 97% match means your profile aligns with nearly every criterion.',
      },
      {
        q: 'How long does it take to get matched?',
        a: 'About 30 seconds. Build your profile (4 minutes), and the engine scores every award instantly. You get a ranked list of your top matches with scores, amounts, deadlines, and explanations.',
      },
    ],
  },
  {
    label: 'Scholara AI advisor',
    faqs: [
      {
        q: 'What is Scholara?',
        a: 'Scholara is your AI scholarship advisor. It knows your profile, your matches, and every deadline. It can draft motivation letters, compare awards side by side, answer eligibility questions, and prep your documents.',
      },
      {
        q: 'Can Scholara write my essays?',
        a: 'Yes — Scholara drafts motivation letters, SOPs, and research proposals tailored to each award\'s actual criteria. But you should always review, personalize, and edit the output. Scholarship committees want to hear your voice.',
      },
      {
        q: 'Is Scholara available 24/7?',
        a: 'Yes. Ask anything, any time. "Can I work while on DAAD?" "Strong SOP for MEXT?" Scholara answers instantly.',
      },
    ],
  },
  {
    label: 'Scholarships & coverage',
    faqs: [
      {
        q: 'What scholarships do you cover?',
        a: 'We index 100+ fully funded awards across 18+ countries: DAAD (Germany), Chevening (UK), MEXT (Japan), Fulbright (US), GKS (South Korea), Erasmus Mundus (EU), Commonwealth, Rhodes, and more. New awards are added monthly.',
      },
      {
        q: 'What does "fully funded" mean?',
        a: 'It means the scholarship covers tuition, living expenses, and usually flights and health insurance. Some also provide a monthly stipend. We label each award\'s coverage so you know exactly what\'s included.',
      },
      {
        q: 'Do you cover undergraduate scholarships?',
        a: 'Yes. While most fully funded international scholarships target master\'s and PhD students, we also index bachelor\'s-level awards where available.',
      },
      {
        q: 'Can I apply through ScholarshipRight?',
        a: 'Currently, ScholarshipRight helps you discover, prepare, and track applications. You submit directly to the scholarship provider. We\'re working on direct application support for the future.',
      },
    ],
  },
  {
    label: 'Account & data',
    faqs: [
      {
        q: 'What data do you collect?',
        a: 'We collect your name, email, and academic profile (degree, field, GPA, research interests, target countries). We never sell your data. See our Privacy Policy for full details.',
      },
      {
        q: 'Can I delete my account?',
        a: 'Yes. Go to Settings → Delete Account. All your data is permanently removed within 30 days.',
      },
      {
        q: 'Is my resume data safe?',
        a: 'Yes. Your resume is processed locally for matching and advisor features. It\'s transmitted over HTTPS and stored securely. We never share it with third parties.',
      },
    ],
  },
  {
    label: 'Technical',
    faqs: [
      {
        q: 'Do I need IELTS to use ScholarshipRight?',
        a: 'No. Some scholarships require language tests, but many don\'t. You can filter for "no IELTS required" scholarships in your search. Scholara can also advise on alternative language requirements.',
      },
      {
        q: 'Which browsers are supported?',
        a: 'ScholarshipRight works on all modern browsers: Chrome, Firefox, Safari, and Edge. It\'s fully responsive on mobile and tablet.',
      },
      {
        q: 'I found a bug. How do I report it?',
        a: 'Use our Contact page or email support@scholarshipright.com. We respond within 24 hours and take every bug report seriously.',
      },
    ],
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#f0ebe0] rounded-xl overflow-hidden transition-all duration-200 hover:border-[#f5b942]/40">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-4 sm:p-5 text-left"
      >
        <span className="text-sm sm:text-base font-bold text-[#1a1a1a]">{q}</span>
        <span className={`flex-shrink-0 w-6 h-6 rounded-full border border-[#f0ebe0] flex items-center justify-center text-xs text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ↓
        </span>
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
          <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function FaqContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[680px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            Help
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            Frequently asked <span className="text-[#f5b942]">questions</span>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-[480px] mx-auto leading-relaxed">
            Everything you need to know about ScholarshipRight. Can&apos;t find your answer?{' '}
            <Link href="/contact" className="text-[#d4972e] font-semibold hover:underline">Contact us</Link>.
          </p>
        </motion.div>
      </header>

      {/* ═══ FAQ SECTIONS ═══ */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-[760px] mx-auto space-y-10 sm:space-y-14">
          {CATEGORIES.map((cat, ci) => (
            <motion.div key={cat.label} {...fadeUp} transition={{ ...fadeUp.transition, delay: ci * 0.05 }}>
              <h2 className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-4">{cat.label}</h2>
              <div className="space-y-2">
                {cat.faqs.map((faq) => (
                  <FaqItem key={faq.q} q={faq.q} a={faq.a} />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="px-4 sm:px-6 py-16 sm:py-20 border-t border-[#f0ebe0] bg-white/50">
        <motion.div className="max-w-[580px] mx-auto text-center" {...fadeUp}>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-3">
            Still have questions?
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Our team is here to help. Reach out and we&apos;ll get back to you within 24 hours.
          </p>
          <Link
            href="/contact"
            className="inline-block text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-7 py-3 hover:bg-[#d4972e] hover:text-white transition"
          >
            Contact us →
          </Link>
        </motion.div>
      </section>
    </LandingShell>
  );
}
