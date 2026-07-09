// Small shared atoms used by both PublicScholarshipCard and ScholarshipCard.
// Keeps styling in sync for the bits that appear in both cards.

import Image from 'next/image';
import type { Scholarship } from '@/services/api';

// ── Days until deadline ──────────────────────────────────────────
export function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

// ── Deadline info — single source of truth for all deadline UI ───
export interface DeadlineInfo {
  days: number;          // 0 = today, negative = expired
  status: 'upcoming' | 'open' | 'expired';
  isUpcoming: boolean;   // open_date in the future
  isExpired: boolean;
  isClosing: boolean;    // today or tomorrow
  isUrgent: boolean;     // ≤7 days
  isSoon: boolean;       // ≤30 days
  label: string;         // "Opens in 5 days", "Closing today", "Application closed"
  shortLabel: string;    // "5d", "Today", "Closed"
  color: string;         // Tailwind bg/text classes
  icon: string;          // material symbol name
}

export function getDeadlineInfo(deadline: string, openDate?: string | null): DeadlineInfo {
  // ── Upcoming: application hasn't opened yet ───────────────────
  if (openDate) {
    const openDiffMs = new Date(openDate).getTime() - Date.now();
    const openDays = Math.ceil(openDiffMs / (1000 * 60 * 60 * 24));
    if (openDays > 0) {
      const isOpeningSoon = openDays <= 7;
      return {
        days: openDays, status: 'upcoming', isUpcoming: true, isExpired: false,
        isClosing: false, isUrgent: false, isSoon: isOpeningSoon,
        label: openDays === 1 ? 'Opens tomorrow' : `Opens in ${openDays} days`,
        shortLabel: openDays === 1 ? 'Tomorrow' : `${openDays}d`,
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: 'event_upcoming',
      };
    }
  }

  // ── Deadline-based statuses ───────────────────────────────────
  const diffMs = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isExpired = days <= 0 && diffMs < 0;

  if (isExpired) {
    return {
      days, status: 'expired', isUpcoming: false, isExpired: true,
      isClosing: false, isUrgent: false, isSoon: false,
      label: 'Application closed',
      shortLabel: 'Closed',
      color: 'bg-gray-100 text-gray-500 border-gray-200',
      icon: 'event_busy',
    };
  }
  if (days === 0) {
    return {
      days: 0, status: 'open', isUpcoming: false, isExpired: false,
      isClosing: true, isUrgent: true, isSoon: true,
      label: 'Closing today',
      shortLabel: 'Today',
      color: 'bg-red-50 text-red-700 border-red-200',
      icon: 'today',
    };
  }
  if (days === 1) {
    return {
      days: 1, status: 'open', isUpcoming: false, isExpired: false,
      isClosing: true, isUrgent: true, isSoon: true,
      label: 'Closing tomorrow',
      shortLabel: 'Tomorrow',
      color: 'bg-red-50 text-red-700 border-red-200',
      icon: 'event_upcoming',
    };
  }
  if (days <= 7) {
    return {
      days, status: 'open', isUpcoming: false, isExpired: false,
      isClosing: false, isUrgent: true, isSoon: true,
      label: `Closing in ${days} days`,
      shortLabel: `${days}d`,
      color: 'bg-red-50 text-red-700 border-red-200',
      icon: 'schedule',
    };
  }
  if (days <= 30) {
    return {
      days, status: 'open', isUpcoming: false, isExpired: false,
      isClosing: false, isUrgent: false, isSoon: true,
      label: `Closing in ${days} days`,
      shortLabel: `${days}d`,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: 'schedule',
    };
  }
  return {
    days, status: 'open', isUpcoming: false, isExpired: false,
    isClosing: false, isUrgent: false, isSoon: false,
    label: `Closing in ${days} days`,
    shortLabel: `${days}d`,
    color: 'bg-primary-light/20 text-text-secondary border-gray-200',
    icon: 'event',
  };
}

// ── Logo thumbnail ───────────────────────────────────────────────
export function ScholarshipLogo({ scholarship, size = 'md' }: {
  scholarship: Scholarship;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims = size === 'sm' ? 'w-8 h-8' : size === 'md' ? 'w-10 h-10' : 'w-16 h-16';
  const imgDims = size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-6 h-6' : 'w-10 h-10';
  const imgPx = size === 'sm' ? 20 : size === 'md' ? 24 : 40;
  const fallbackIcon = size === 'lg' ? 'school' : 'school';
  const fallbackSize = size === 'lg' ? 'text-3xl' : 'text-lg';

  return (
    <div className={`${dims} rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200`}>
      {scholarship.logo_url ? (
        <Image src={scholarship.logo_url} alt={`${scholarship.provider || scholarship.name} logo`} width={imgPx} height={imgPx} className={`${imgDims} object-contain`} unoptimized />
      ) : (
        <span className={`material-symbols-outlined ${fallbackSize} text-text-secondary`}>{fallbackIcon}</span>
      )}
    </div>
  );
}

// ── Degree level chips ───────────────────────────────────────────
export function DegreeChips({ levels, variant = 'brand' }: {
  levels?: string[];
  variant?: 'brand' | 'neutral';
}) {
  if (!levels?.length) return null;
  const cls = variant === 'brand'
    ? 'bg-[#f5b942]/10 text-[#d4972e] border border-[#f5b942]/20'
    : 'bg-gray-100 text-text-primary';

  return (
    <>
      {levels.map((d) => (
        <span key={d} className={`px-2.5 py-0.5 rounded-[8px] text-[12px] font-medium ${cls}`}>
          {d.charAt(0).toUpperCase() + d.slice(1)}
        </span>
      ))}
    </>
  );
}

// ── Funding type badge ───────────────────────────────────────────
export function FundingBadge({ fundingType }: { fundingType?: string }) {
  if (!fundingType) return null;
  const label = fundingType === 'fully_funded' ? 'Fully Funded' : fundingType.replace('_', ' ');
  return (
    <span className="px-2.5 py-0.5 rounded-[8px] bg-gray-100 text-[12px] font-medium text-text-primary">
      {label}
    </span>
  );
}
