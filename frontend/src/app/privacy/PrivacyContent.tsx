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

const SECTIONS = [
  {
    title: 'Information we collect',
    content: [
      'When you create an account, we collect your name, email address, and password (stored as a bcrypt hash — we never see your raw password).',
      'When you build your profile, we collect academic information you provide: degree level, field of study, GPA, research interests, target countries, language scores, and uploaded resume data.',
      'When you use our services, we automatically collect basic usage data: pages visited, features used, and session timestamps. This helps us improve matching accuracy.',
    ],
  },
  {
    title: 'How we use your information',
    content: [
      'To provide scholarship matching: your academic profile is processed by our AI engine to score and rank scholarship awards by fit.',
      'To power Scholara: your profile data and match results are used by our AI advisor to draft essays, compare awards, and answer questions.',
      'To send you relevant notifications: deadline reminders for saved scholarships, weekly digest emails, and account-related communications.',
      'To improve our platform: aggregated, anonymized usage data helps us understand which features matter most and where students struggle.',
    ],
  },
  {
    title: 'Information we do NOT share',
    content: [
      'We do not sell your personal data to third parties. Full stop.',
      'We do not share your profile, resume, or academic information with scholarship providers unless you explicitly apply through our platform.',
      'We do not use your data for advertising or ad targeting.',
    ],
  },
  {
    title: 'Third-party services',
    content: [
      'Google OAuth: if you sign in with Google, we receive your name, email, and profile picture from Google. We do not access any other Google data.',
      'Email delivery: we use transactional email services to send you confirmations, reminders, and digests. Your email is shared only for this purpose.',
      'Analytics: we use privacy-focused analytics to understand usage patterns. No data is sold or shared with advertising networks.',
    ],
  },
  {
    title: 'Data security',
    content: [
      'All data is transmitted over HTTPS/TLS encryption.',
      'Passwords are hashed with bcrypt — we never store or see your plaintext password.',
      'Session tokens are httpOnly cookies with secure flags, not accessible via JavaScript.',
      'We conduct regular security reviews and follow industry best practices for data protection.',
    ],
  },
  {
    title: 'Your rights',
    content: [
      'Access: you can view and download your profile data at any time from your account settings.',
      'Deletion: you can delete your account and all associated data from your settings page. Deletion is permanent and processed within 30 days.',
      'Correction: you can update your profile, resume, and account information at any time.',
      'Portability: contact us to request a machine-readable export of your data.',
    ],
  },
  {
    title: 'Data retention',
    content: [
      'We retain your account data for as long as your account is active.',
      'If you delete your account, all personal data is permanently removed within 30 days.',
      'Aggregated, anonymized usage statistics may be retained indefinitely for platform improvement.',
    ],
  },
  {
    title: 'Children\'s privacy',
    content: [
      'ScholarshipRight is intended for students aged 16 and older. We do not knowingly collect data from children under 16.',
      'If we learn that we have collected data from a child under 16, we will delete it promptly.',
    ],
  },
  {
    title: 'Changes to this policy',
    content: [
      'We may update this privacy policy from time to time. If we make material changes, we will notify you by email or through a prominent notice on our platform.',
      'The "Last updated" date at the top reflects the most recent revision.',
    ],
  },
  {
    title: 'Contact us',
    content: [
      'If you have questions about this privacy policy or how we handle your data, contact us at privacy@scholarshipright.com or visit our ',
    ],
  },
];

export default function PrivacyContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[680px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            Legal
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            Privacy <span className="text-[#f5b942]">Policy</span>
          </h1>
          <p className="text-sm text-gray-500">Last updated: June 27, 2026</p>
        </motion.div>
      </header>

      {/* ═══ CONTENT ═══ */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-[760px] mx-auto space-y-4 sm:space-y-5">
          <motion.div className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7 mb-8" {...fadeUp}>
            <p className="text-sm text-gray-600 leading-relaxed">
              <strong>Your privacy matters.</strong> ScholarshipRight is built to help you find scholarships — not to harvest your data. This policy explains what we collect, why, and how we protect it. We keep it plain and readable because you deserve to understand what happens with your information.
            </p>
          </motion.div>

          {SECTIONS.map((s, i) => (
            <motion.div
              key={s.title}
              className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.04 }}
            >
              <h2 className="font-bold text-base sm:text-lg mb-3">{s.title}</h2>
              <ul className="space-y-2.5">
                {s.content.map((c, j) => (
                  <li key={j} className="flex gap-3 text-sm text-gray-600 leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#f5b942] flex-shrink-0" />
                    <span>
                      {c}
                      {s.title === 'Contact us' && j === 0 && (
                        <>
                          <Link href="/contact" className="text-[#d4972e] font-semibold hover:underline">contact page</Link>.
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </section>
    </LandingShell>
  );
}
