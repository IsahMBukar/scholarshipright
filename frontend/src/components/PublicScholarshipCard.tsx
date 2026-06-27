'use client';

import Link from 'next/link';
import type { Scholarship } from '@/services/api';

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = daysUntil(deadline);
  const isUrgent = days <= 30;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
      isUrgent
        ? 'bg-red-50 text-red-700 border border-red-200'
        : 'bg-[#fdfbf7] text-gray-600 border border-[#f0ebe0]'
    }`}>
      {isUrgent ? '⏰' : '📅'}
      {days === 0 ? 'Deadline passed' : `${days}d left`}
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
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
            {scholarship.logo_url ? (
              <img src={scholarship.logo_url} alt="" className="w-6 h-6 object-contain" />
            ) : (
              <span className="text-lg">🎓</span>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-[#1a1a1a] truncate group-hover:text-[#d4972e] transition-colors">
              {scholarship.name}
            </h3>
            <p className="text-[11px] sm:text-xs text-gray-500 truncate">
              {scholarship.provider} · {scholarship.host_country}
            </p>
          </div>
        </div>
        <DeadlineBadge deadline={scholarship.deadline} />
      </div>

      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed line-clamp-2 mb-3">
        {scholarship.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {scholarship.degree_levels?.map((d) => (
          <span key={d} className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-[#f5b942]/10 text-[#d4972e] border border-[#f5b942]/20">
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </span>
        ))}
        <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold border ${
          scholarship.funding_type === 'fully_funded'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-gray-50 text-gray-600 border-gray-200'
        }`}>
          {scholarship.funding_type === 'fully_funded' ? 'Fully Funded' : scholarship.funding_type?.replace('_', ' ')}
        </span>
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
