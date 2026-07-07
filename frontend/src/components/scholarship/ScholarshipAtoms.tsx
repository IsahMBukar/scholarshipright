// Small shared atoms used by both PublicScholarshipCard and ScholarshipCard.
// Keeps styling in sync for the bits that appear in both cards.

import Image from 'next/image';
import type { Scholarship } from '@/services/api';

// ── Days until deadline ──────────────────────────────────────────
export function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
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
