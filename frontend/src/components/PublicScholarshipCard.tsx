'use client';

import Link from 'next/link';
import type { Scholarship } from '@/services/api';
import { getDeadlineInfo, ScholarshipLogo, DegreeChips, FundingBadge } from '@/components/scholarship/ScholarshipAtoms';

function DeadlineBadge({ deadline, openDate }: { deadline: string; openDate?: string | null }) {
  const dl = getDeadlineInfo(deadline, openDate);
  if (dl.isExpired) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
        <span className="material-symbols-outlined text-[12px]">event_busy</span>
        Closed
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${dl.color}`}>
      <span className="material-symbols-outlined text-[12px]">{dl.icon}</span>
      {dl.shortLabel}
    </span>
  );
}

export default function PublicScholarshipCard({ scholarship }: { scholarship: Scholarship }) {
  return (
    <Link
      href={`/scholarships/${scholarship.slug}`}
      className="block bg-white rounded-2xl border border-[#f0ebe0] p-5 sm:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(212,151,46,0.18)] hover:border-[#f5b942]/40 group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <ScholarshipLogo scholarship={scholarship} size="sm" />
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-[#1a1a1a] truncate group-hover:text-[#d4972e] transition-colors">
              {scholarship.name}
            </h3>
            <p className="text-[11px] sm:text-xs text-gray-500 truncate">
              {scholarship.provider} · {scholarship.host_country}
            </p>
          </div>
        </div>
        <DeadlineBadge deadline={scholarship.deadline} openDate={scholarship.open_date} />
      </div>

      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed line-clamp-2 mb-3">
        {scholarship.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <DegreeChips levels={scholarship.degree_levels} variant="brand" />
        <FundingBadge fundingType={scholarship.funding_type} />
        {scholarship.monthly_stipend_usd && (
          <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-gray-50 text-gray-600 border border-gray-200">
            ~${scholarship.monthly_stipend_usd}/mo
          </span>
        )}
        {scholarship.requires_ielts === false && (
          <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            No IELTS
          </span>
        )}
      </div>
    </Link>
  );
}
