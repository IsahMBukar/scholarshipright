'use client';

import Link from 'next/link';
import type { Scholarship } from '@/services/api';
import { daysUntil, ScholarshipLogo, DegreeChips, FundingBadge } from '@/components/scholarship/ScholarshipAtoms';

interface ScholarshipCardProps {
  scholarship: Scholarship;
  onSave?: (id: string) => void;
  isSaved?: boolean;
  savedStatus?: string;
  onApplyNow?: (id: string) => void;
  /**
   * Whether to render match-score UI. Defaults to true for backwards
   * compatibility. When false, the deterministic 65–95% placeholder is
   * NOT shown — we never want to mislead users with a fake score.
   */
  showMatchScore?: boolean;
  /** Whether the current user is authenticated. Affects the no-score CTA. */
  isAuthenticated?: boolean;
}

function getMatchLabel(score: number): string {
  if (score >= 85) return 'STRONG MATCH';
  if (score >= 70) return 'GOOD MATCH';
  if (score >= 50) return 'FAIR MATCH';
  return 'LOW MATCH';
}

function getMatchColor(score: number): string {
  if (score >= 85) return 'text-amber-700';
  if (score >= 70) return 'text-primary';
  if (score >= 50) return 'text-amber-600/80';
  return 'text-text-secondary';
}

export default function ScholarshipCard({ scholarship, onSave, isSaved, savedStatus, onApplyNow, showMatchScore = true, isAuthenticated = false }: ScholarshipCardProps) {
  // Only show a real score if both the caller asked for it AND the backend
  // returned one. Never fall back to a deterministic pseudo-score — that
  // would mislead users who haven't completed onboarding.
  const realScore = showMatchScore && scholarship.match_score != null
    ? scholarship.match_score
    : null;
  const daysUntilDeadline = daysUntil(scholarship.deadline);
  const isUrgent = daysUntilDeadline <= 30;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] rounded-card bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden">

      {/* ===== MOBILE LAYOUT ===== */}
      <div className="md:hidden">
        {/* Top row: Logo + Verified left | Match label + score right (or profile CTA) */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <ScholarshipLogo scholarship={scholarship} size="md" />
            {scholarship.is_verified && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] bg-primary-light text-[12px] font-medium text-primary">
                <span className="material-symbols-outlined text-[13px]">verified</span>
                Verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {realScore != null ? (
              <>
                <span className={`text-[12px] font-bold tracking-wide ${getMatchColor(realScore)}`}>
                  {getMatchLabel(realScore)}
                </span>
                <span className={`text-[22px] font-extrabold ${getMatchColor(realScore)}`}>
                  {realScore}<span className="text-[13px] font-bold text-gray-400">%</span>
                </span>
              </>
            ) : (
              <a
                href={isAuthenticated ? "/profile" : "/signup"}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {isAuthenticated ? 'Set up profile for score →' : 'Login for score →'}
              </a>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          {/* Urgent badge */}
          {isUrgent && (
            <div className="mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] bg-red-50 text-[12px] font-medium text-red-500">
                Closes in {daysUntilDeadline}d
              </span>
            </div>
          )}
          {savedStatus && savedStatus !== 'saved' && (
            <div className="mb-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] text-[11px] font-semibold ${
                savedStatus === 'applying' ? 'bg-blue-50 text-blue-600' :
                savedStatus === 'applied' ? 'bg-emerald-50 text-emerald-600' :
                savedStatus === 'reviewing' ? 'bg-amber-50 text-amber-600' :
                savedStatus === 'accepted' ? 'bg-green-50 text-green-600' :
                savedStatus === 'rejected' ? 'bg-red-50 text-red-500' :
                'bg-gray-100 text-gray-600'
              }`}>
                {savedStatus.charAt(0).toUpperCase() + savedStatus.slice(1)}
              </span>
            </div>
          )}

          {/* Title */}
          <Link href={`/scholarships/${scholarship.slug}`}>
            <h3 className="text-[16px] font-bold leading-tight text-text-primary hover:text-primary transition-colors line-clamp-2">
              {scholarship.name}
            </h3>
          </Link>

          {/* Provider & Country */}
          <p className="text-[13px] text-text-secondary mt-1 truncate">
            {scholarship.provider || scholarship.host_institution} · {scholarship.host_country}
          </p>

          {/* Info chips */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {scholarship.degree_levels?.map((d) => (
              <span key={d} className="px-2.5 py-0.5 rounded-[8px] bg-gray-100 text-[12px] font-medium text-text-primary">
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </span>
            ))}
            <span className="px-2.5 py-0.5 rounded-[8px] bg-gray-100 text-[12px] font-medium text-text-primary">
              {scholarship.funding_type === 'fully_funded' ? 'Fully Funded' : scholarship.funding_type?.replace('_', ' ')}
            </span>
            {scholarship.covers_living && (
              <span className="px-2.5 py-0.5 rounded-[8px] bg-gray-100 text-[12px] font-medium text-text-primary">
                Living Allowance
              </span>
            )}
            {!scholarship.requires_ielts && (
              <span className="px-2.5 py-0.5 rounded-[8px] bg-primary-light text-[12px] font-medium text-primary">
                No IELTS
              </span>
            )}
          </div>

          {/* Deadline */}
          <p className="text-[12px] text-[#9b9b9b] mt-2.5">
            Deadline: {new Date(scholarship.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Bottom actions */}
        <div className="flex items-center justify-between px-4 pb-4 pt-2 border-t border-gray-100">
          <button
            onClick={() => onSave?.(scholarship.id)}
            className="flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">{isSaved ? 'bookmark' : 'bookmark_border'}</span>
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <a
            href={scholarship.official_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onApplyNow?.(scholarship.id)}
            className="px-5 py-2 bg-primary text-white text-[13px] font-semibold rounded-btn hover:brightness-110 transition-all"
          >
            {savedStatus === 'applying' ? 'Continue Now' : 'Apply Now'}
          </a>
        </div>
      </div>

      {/* ===== DESKTOP LAYOUT ===== */}
      <div className="hidden md:flex p-6 gap-4">
        {/* Logo */}
        <ScholarshipLogo scholarship={scholarship} size="lg" />

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
            {savedStatus && savedStatus !== 'saved' && (
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-[10px] text-[12px] font-semibold ${
                savedStatus === 'applying' ? 'bg-blue-50 text-blue-600' :
                savedStatus === 'applied' ? 'bg-emerald-50 text-emerald-600' :
                savedStatus === 'reviewing' ? 'bg-amber-50 text-amber-600' :
                savedStatus === 'accepted' ? 'bg-green-50 text-green-600' :
                savedStatus === 'rejected' ? 'bg-red-50 text-red-500' :
                'bg-gray-100 text-gray-600'
              }`}>
                {savedStatus.charAt(0).toUpperCase() + savedStatus.slice(1)}
              </span>
            )}
          </div>

          {/* Title */}
          <Link href={`/scholarships/${scholarship.slug}`}>
            <h3 className="text-[22px] font-bold leading-tight text-text-primary hover:text-primary transition-colors line-clamp-2">
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

      {/* Desktop score block — right side (only when we have a real score) */}
      {realScore != null ? (
        <div className="hidden md:flex flex-col items-center justify-center match-gradient rounded-r-card rounded-l-none p-4 gap-2">
          <span className="text-[40px] font-extrabold text-white leading-none">
            {realScore}<span className="text-[18px] font-bold text-gray-400">%</span>
          </span>
          <span className="text-[10px] font-bold tracking-widest text-primary uppercase">
            {getMatchLabel(realScore)}
          </span>
          {!scholarship.requires_ielts && (
            <span className="text-[10px] text-gray-400 font-medium">No IELTS</span>
          )}
          <div className="w-full h-px bg-gray-700 my-1" />
          <a
            href={scholarship.official_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onApplyNow?.(scholarship.id)}
            className="w-full text-center py-2 bg-primary text-white text-[13px] font-semibold rounded-btn hover:brightness-110 transition-all"
          >
            {savedStatus === 'applying' ? 'Continue Now' : 'Apply Now'}
          </a>
          <button
            onClick={() => onSave?.(scholarship.id)}
            className="w-full text-center py-1.5 border border-gray-600 text-gray-300 text-[12px] font-medium rounded-btn hover:border-primary hover:text-primary transition-all"
            aria-label={isSaved ? 'Remove from saved' : 'Save this scholarship'}
          >
            {isSaved ? '★ Saved' : '☆ Save'}
          </button>
        </div>
      ) : (
        <div className="hidden md:flex flex-col items-center justify-center match-gradient rounded-r-card rounded-l-none p-4 gap-2 min-w-[140px]">
          <span className="material-symbols-outlined text-primary text-[28px]">{isAuthenticated ? 'school' : 'lock'}</span>
          <p className="text-[11px] text-center text-white/90 leading-snug px-1">
            {isAuthenticated ? 'Set up your profile to see your match score.' : 'Sign in to see your match score.'}
          </p>
          <a
            href={isAuthenticated ? "/profile" : "/signup"}
            className="w-full text-center py-2 bg-primary text-white text-[12px] font-bold rounded-btn hover:brightness-110 transition-all"
          >
            {isAuthenticated ? 'Complete profile' : 'Sign in'}
          </a>
        </div>
      )}
    </div>
  );
}
