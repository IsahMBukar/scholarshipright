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
    title: 'Acceptance of terms',
    content: [
      'By creating an account or using ScholarshipRight, you agree to these Terms of Service. If you do not agree, please do not use the platform.',
      'You must be at least 16 years old to use ScholarshipRight.',
    ],
  },
  {
    title: 'What ScholarshipRight provides',
    content: [
      'ScholarshipRight is an AI-powered scholarship discovery platform. We match students to fully funded international scholarships based on their academic profile.',
      'Our AI advisor, Scholara, provides guidance on scholarship applications — including essay drafting, award comparison, and document preparation.',
      'ScholarshipRight is a discovery and preparation tool. We are not a scholarship provider. We do not guarantee acceptance, funding, or any specific outcome.',
    ],
  },
  {
    title: 'Your account',
    content: [
      'You are responsible for maintaining the security of your account. Use a strong, unique password.',
      'You must provide accurate information in your profile. Match scores are only as good as the data you provide.',
      'One account per person. Do not create multiple accounts or share your account credentials.',
      'You may delete your account at any time from your settings page.',
    ],
  },
  {
    title: 'Acceptable use',
    content: [
      'Use ScholarshipRight for its intended purpose: discovering and applying for scholarships.',
      'Do not attempt to scrape, copy, or redistribute our scholarship database.',
      'Do not use automated tools (bots, scrapers, scripts) to access the platform.',
      'Do not upload malicious content, spam, or impersonate others.',
      'Do not attempt to reverse-engineer our matching algorithm or AI systems.',
    ],
  },
  {
    title: 'AI-generated content',
    content: [
      'Scholara generates essays, letters, and other written content based on your profile and scholarship criteria.',
      'AI-generated content is a starting point, not a final product. You are responsible for reviewing, editing, and personalizing all content before submission.',
      'ScholarshipRight is not responsible for the accuracy, completeness, or outcome of AI-generated content.',
      'Do not submit AI-generated content as your own without review. Most scholarship providers expect original, personal writing.',
    ],
  },
  {
    title: 'Intellectual property',
    content: [
      'ScholarshipRight and its original content, features, and functionality are owned by ScholarshipRight and protected by copyright and other intellectual property laws.',
      'You retain ownership of content you upload (resume, profile data). By uploading, you grant us a license to process it for matching and advisory services.',
      'Scholarship data is compiled from publicly available sources. We attribute sources where applicable.',
    ],
  },
  {
    title: 'Limitation of liability',
    content: [
      'ScholarshipRight is provided "as is" without warranties of any kind, express or implied.',
      'We do not guarantee that the platform will be uninterrupted, error-free, or that match scores will result in scholarship acceptance.',
      'To the fullest extent permitted by law, ScholarshipRight shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform.',
      'Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim (which is currently $0 for free users).',
    ],
  },
  {
    title: 'Termination',
    content: [
      'We may suspend or terminate your account if you violate these terms, engage in abusive behavior, or misuse the platform.',
      'Upon termination, your right to use ScholarshipRight ceases immediately. We will delete your data within 30 days.',
      'You may terminate your account at any time by deleting it from your settings.',
    ],
  },
  {
    title: 'Changes to these terms',
    content: [
      'We may update these terms from time to time. If we make material changes, we will notify you by email or through a prominent notice on the platform.',
      'Your continued use of ScholarshipRight after changes constitutes acceptance of the updated terms.',
    ],
  },
  {
    title: 'Contact',
    content: [
      'If you have questions about these terms, contact us at legal@scholarshipright.com or visit our ',
    ],
  },
];

export default function TermsContent() {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-12 sm:pb-16">
        <motion.div className="text-center max-w-[680px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            Legal
          </span>
          <h1 className="text-[34px] sm:text-[44px] md:text-[56px] font-black tracking-[-0.035em] leading-[1.05] sm:leading-[1.02] mb-4 sm:mb-5">
            Terms of <span className="text-[#f5b942]">Service</span>
          </h1>
          <p className="text-sm text-gray-500">Last updated: June 27, 2026</p>
        </motion.div>
      </header>

      {/* ═══ CONTENT ═══ */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-[760px] mx-auto space-y-4 sm:space-y-5">
          <motion.div className="bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-7 mb-8" {...fadeUp}>
            <p className="text-sm text-gray-600 leading-relaxed">
              <strong>Plain language summary:</strong> Use ScholarshipRight to find scholarships. Don&apos;t abuse the platform. We provide tools, not guarantees. Your data is yours. AI content needs your review. These terms protect both of us.
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
                      {s.title === 'Contact' && j === 0 && (
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
