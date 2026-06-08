'use client';

import Link from 'next/link';
import type { Scholarship } from '@/services/api';

function deterministicScore(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return 65 + (Math.abs(hash) % 30);
}

interface ScholarshipCardProps {
  scholarship: Scholarship;
  onSave?: (id: string) => void;
  isSaved?: boolean;
}

function getMatchLabel(score: number): string {
  if (score >= 85) return 'STRONG MATCH';
  if (score >= 70) return 'GOOD MATCH';
  if (score >= 50) return 'FAIR MATCH';
  return 'LOW MATCH';
}

export default function ScholarshipCard({ scholarship, onSave, isSaved }: ScholarshipCardProps) {
  const score = scholarship.match_score || deterministicScore(scholarship.id);
  const daysUntilDeadline = Math.max(0, Math.ceil(
    (new Date(scholarship.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));
  const isUrgent = daysUntilDeadline <= 30;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] rounded-card bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Main content */}
      <div className="p-6 flex gap-4">
        {/* Logo */}
        <div className="hidden sm:flex w-14 h-14 md:w-16 md:h-16 rounded-chip bg-gray-100 items-center justify-center flex-shrink-0">
          {scholarship.logo_url ? (
            <img src={scholarship.logo_url} alt="" className="w-10 h-10 object-contain" />
          ) : (
            <span className="material-symbols-outlined text-3xl text-text-secondary">school</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Status badge */}
          <div className="flex items-center gap-2 mb-2">
            {scholarship.is_verified && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-[10px] bg-primary-light text-[13px] font-medium text-primary">
                <span className="material-symbols-outlined text-[14px]">verified</span>
                Verified
              </span>
            )}
            {isUrgent && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-[10px] bg-red-50 text-[13px] font-medium text-red-500">
                Closes in {daysUntilDeadline}d
              </span>
            )}
          </div>

          {/* Title */}
          <Link href={`/scholarships/${scholarship.slug}`}>
            <h3 className="text-[18px] md:text-[22px] font-bold leading-tight text-text-primary hover:text-primary transition-colors line-clamp-2">
              {scholarship.name}
            </h3>
          </Link>

          {/* Provider & Country */}
          <p className="text-[14px] text-text-secondary mt-1">
            {scholarship.provider || scholarship.host_institution} · {scholarship.host_country}
          </p>

          {/* Info chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {scholarship.degree_levels?.map((d) => (
              <span key={d} className="px-3 py-1 rounded-[10px] bg-gray-100 text-[13px] font-medium text-text-primary">
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </span>
            ))}
            <span className="px-3 py-1 rounded-[10px] bg-gray-100 text-[13px] font-medium text-text-primary">
              {scholarship.funding_type === 'fully_funded' ? 'Fully Funded' : scholarship.funding_type?.replace('_', ' ')}
            </span>
            {scholarship.covers_living && (
              <span className="px-3 py-1 rounded-[10px] bg-gray-100 text-[13px] font-medium text-text-primary">
                Living Allowance
              </span>
            )}
            {!scholarship.requires_ielts && (
              <span className="px-3 py-1 rounded-[10px] bg-primary-light text-[13px] font-medium text-primary">
                No IELTS
              </span>
            )}
          </div>

          {/* Deadline info */}
          <p className="text-[13px] text-[#9b9b9b] mt-3">
            Deadline: {new Date(scholarship.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Desktop score block — right side */}
      <div className="hidden md:flex flex-col items-center justify-center match-gradient rounded-r-card rounded-l-none p-4 gap-2">
        <span className="text-[40px] font-extrabold text-white leading-none">
          {score}<span className="text-[18px] font-bold text-gray-400">%</span>
        </span>
        <span className="text-[10px] font-bold tracking-widest text-primary uppercase">
          {getMatchLabel(score)}
        </span>
        {!scholarship.requires_ielts && (
          <span className="text-[10px] text-gray-400 font-medium">No IELTS</span>
        )}
        <div className="w-full h-px bg-gray-700 my-1" />
        <Link
          href={scholarship.official_url}
          target="_blank"
          className="w-full text-center py-2 bg-primary text-white text-[13px] font-semibold rounded-btn hover:brightness-110 transition-all"
        >
          Apply Now
        </Link>
        <button
          onClick={() => onSave?.(scholarship.id)}
          className="w-full text-center py-1.5 border border-gray-600 text-gray-300 text-[12px] font-medium rounded-btn hover:border-primary hover:text-primary transition-all"
        >
          {isSaved ? '★ Saved' : '☆ Save'}
        </button>
      </div>

      {/* Mobile score + actions */}
      <div className="md:hidden flex items-center justify-between px-6 pb-4 border-t border-gray-200 pt-3">
        <div className="flex items-center gap-3">
          <span className="text-[24px] font-extrabold text-text-primary">{score}%</span>
          <span className="text-[12px] font-bold tracking-wider text-primary uppercase">{getMatchLabel(score)}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onSave?.(scholarship.id)} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:border-primary transition-colors">
            <span className="material-symbols-outlined text-[20px]">{isSaved ? 'bookmark' : 'bookmark_border'}</span>
          </button>
          <Link
            href={scholarship.official_url}
            target="_blank"
            className="px-5 py-2 bg-primary text-white text-[14px] font-semibold rounded-btn hover:brightness-110 transition-all flex items-center"
          >
            Apply
          </Link>
        </div>
      </div>
    </div>
  );
}
