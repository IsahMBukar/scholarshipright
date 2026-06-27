'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import LandingShell from '@/components/LandingShell';
import PublicScholarshipCard from '@/components/PublicScholarshipCard';
import type { Scholarship } from '@/services/api';
import type { CategoryDefinition } from '@/lib/scholarship-categories';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
};

interface Props {
  category: CategoryDefinition;
  scholarships: Scholarship[];
}

export default function CategoryContent({ category, scholarships }: Props) {
  return (
    <LandingShell>
      {/* ═══ HERO ═══ */}
      <header className="px-4 sm:px-6 pt-28 sm:pt-32 pb-10 sm:pb-14">
        <motion.div className="max-w-[1080px] mx-auto" {...fadeUp}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5b942]/10 border border-[#f5b942]/30 text-[11px] sm:text-xs font-semibold text-[#d4972e] uppercase tracking-wider mb-5 sm:mb-6">
            Scholarship discovery
          </span>
          <h1 className="text-[28px] sm:text-[36px] md:text-[48px] font-black tracking-[-0.03em] leading-[1.1] mb-3 sm:mb-4">
            {category.h1}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 max-w-[560px] leading-relaxed">
            {category.intro}
          </p>
          <div className="mt-5 sm:mt-6 flex items-center gap-3">
            <span className="text-sm font-bold text-[#1a1a1a]">
              {scholarships.length} {scholarships.length === 1 ? 'scholarship' : 'scholarships'} found
            </span>
            <span className="text-sm text-gray-400">·</span>
            <Link href="/signup" className="text-sm font-semibold text-[#d4972e] hover:underline">
              Sign up for AI matching →
            </Link>
          </div>
        </motion.div>
      </header>

      {/* ═══ RESULTS ═══ */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-[1080px] mx-auto">
          {scholarships.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              {scholarships.map((sch, i) => (
                <motion.div
                  key={sch.id}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: Math.min(i * 0.04, 0.4) }}
                >
                  <PublicScholarshipCard scholarship={sch} />
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div className="text-center py-16" {...fadeUp}>
              <p className="text-lg font-bold text-gray-400 mb-2">No scholarships found</p>
              <p className="text-sm text-gray-500">Check back soon — new awards are added monthly.</p>
            </motion.div>
          )}
        </div>
      </section>

      {/* ═══ BROWSE MORE ═══ */}
      <section className="px-4 sm:px-6 py-12 sm:py-16 border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1080px] mx-auto text-center">
          <p className="text-xs font-bold text-[#d4972e] uppercase tracking-[0.15em] mb-3">Browse more</p>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-4">
            Looking for something else?
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { href: '/scholarships/category/masters', label: "Master's" },
              { href: '/scholarships/category/phd', label: 'PhD' },
              { href: '/scholarships/category/fully-funded', label: 'Fully Funded' },
              { href: '/scholarships/category/germany', label: 'Germany' },
              { href: '/scholarships/category/united-kingdom', label: 'UK' },
              { href: '/scholarships/category/japan', label: 'Japan' },
              { href: '/scholarships/category/no-ielts', label: 'No IELTS' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 rounded-full text-xs font-semibold border border-[#f0ebe0] text-gray-600 hover:border-[#f5b942] hover:text-[#d4972e] transition"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="mt-6">
            <Link
              href="/signup"
              className="inline-block text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-7 py-3 hover:bg-[#d4972e] hover:text-white transition"
            >
              Get AI-matched to your profile →
            </Link>
          </div>
        </div>
      </section>
    </LandingShell>
  );
}
