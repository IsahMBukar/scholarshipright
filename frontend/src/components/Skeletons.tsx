'use client';

/* ============================================================
   Skeleton primitives — golden-themed shimmer loading states
   ============================================================ */

// Base pulse with golden tint
function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200/80 ${className}`} />;
}

/* ---------- Scholarship Card Skeleton (Mobile + Desktop) ---------- */
export function ScholarshipCardSkeleton() {
  return (
    <div className="rounded-card bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Mobile skeleton */}
      <div className="md:hidden">
        {/* Top row: logo + match */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <Pulse className="w-11 h-11 rounded-xl" />
            <Pulse className="w-20 h-4 rounded" />
          </div>
          <Pulse className="w-14 h-7 rounded" />
        </div>
        {/* Content */}
        <div className="px-4 pb-3 space-y-2.5">
          <Pulse className="w-3/4 h-5 rounded" />
          <Pulse className="w-1/2 h-3.5 rounded" />
          <div className="flex gap-1.5 pt-1">
            <Pulse className="w-16 h-6 rounded-[8px]" />
            <Pulse className="w-20 h-6 rounded-[8px]" />
            <Pulse className="w-14 h-6 rounded-[8px]" />
          </div>
          <Pulse className="w-32 h-3 rounded" />
        </div>
        {/* Actions */}
        <div className="flex items-center justify-between px-4 pb-4 pt-2 border-t border-gray-100">
          <Pulse className="w-12 h-4 rounded" />
          <Pulse className="w-24 h-9 rounded-btn" />
        </div>
      </div>

      {/* Desktop skeleton */}
      <div className="hidden md:grid md:grid-cols-[1fr_140px]">
        <div className="p-6 flex gap-4">
          <Pulse className="w-16 h-16 rounded-chip flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="flex gap-2">
              <Pulse className="w-16 h-6 rounded-[10px]" />
              <Pulse className="w-24 h-6 rounded-[10px]" />
            </div>
            <Pulse className="w-3/4 h-6 rounded" />
            <Pulse className="w-1/2 h-4 rounded" />
            <div className="flex gap-2">
              <Pulse className="w-16 h-7 rounded-[10px]" />
              <Pulse className="w-24 h-7 rounded-[10px]" />
              <Pulse className="w-20 h-7 rounded-[10px]" />
            </div>
            <Pulse className="w-40 h-3 rounded" />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-4 gap-3 bg-gray-800 rounded-r-card">
          <Pulse className="w-16 h-10 rounded bg-gray-700" />
          <Pulse className="w-20 h-3 rounded bg-gray-700" />
          <Pulse className="w-full h-9 rounded-btn bg-gray-700" />
          <Pulse className="w-full h-8 rounded-btn bg-gray-700" />
        </div>
      </div>
    </div>
  );
}

/* ---------- Scholarship List Skeleton ---------- */
export function ScholarshipListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ScholarshipCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ---------- Scholarship Detail Skeleton ---------- */
export function ScholarshipDetailSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Pulse className="w-16 h-16 md:w-20 md:h-20 rounded-chip flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <Pulse className="w-20 h-6 rounded-[10px]" />
            <Pulse className="w-28 h-6 rounded-[10px]" />
          </div>
          <Pulse className="w-4/5 h-7 rounded" />
          <Pulse className="w-1/3 h-4 rounded" />
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <Pulse className="w-20 h-7 rounded-[10px]" />
        <Pulse className="w-28 h-7 rounded-[10px]" />
        <Pulse className="w-24 h-7 rounded-[10px]" />
        <Pulse className="w-16 h-7 rounded-[10px]" />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Pulse className="w-16 h-3 rounded" />
            <Pulse className="w-24 h-5 rounded" />
          </div>
        ))}
      </div>

      {/* Content blocks */}
      <div className="space-y-3">
        <Pulse className="w-32 h-5 rounded" />
        <Pulse className="w-full h-3 rounded" />
        <Pulse className="w-full h-3 rounded" />
        <Pulse className="w-5/6 h-3 rounded" />
        <Pulse className="w-full h-3 rounded" />
        <Pulse className="w-2/3 h-3 rounded" />
      </div>

      {/* CTA */}
      <div className="flex gap-3">
        <Pulse className="w-36 h-12 rounded-btn" />
        <Pulse className="w-28 h-12 rounded-btn" />
      </div>
    </div>
  );
}

/* ---------- Profile Skeleton ---------- */
export function ProfileSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Pulse className="w-16 h-16 rounded-full" />
        <div className="space-y-2">
          <Pulse className="w-32 h-5 rounded" />
          <Pulse className="w-48 h-3.5 rounded" />
        </div>
      </div>

      {/* Form fields */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Pulse className="w-24 h-3.5 rounded" />
          <Pulse className="w-full h-11 rounded-lg" />
        </div>
      ))}

      {/* Tags section */}
      <div className="space-y-2">
        <Pulse className="w-28 h-3.5 rounded" />
        <div className="flex flex-wrap gap-2">
          <Pulse className="w-20 h-8 rounded-[10px]" />
          <Pulse className="w-24 h-8 rounded-[10px]" />
          <Pulse className="w-16 h-8 rounded-[10px]" />
          <Pulse className="w-20 h-8 rounded-[10px]" />
        </div>
      </div>

      <Pulse className="w-32 h-11 rounded-btn" />
    </div>
  );
}

/* ---------- Saved Page Skeleton ---------- */
export function SavedCardSkeleton() {
  return (
    <div className="rounded-card bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden p-4 md:p-6">
      <div className="flex items-start gap-4">
        <Pulse className="w-12 h-12 md:w-14 md:h-14 rounded-chip flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <Pulse className="w-2/3 h-5 rounded" />
            <Pulse className="w-16 h-6 rounded-[10px]" />
          </div>
          <Pulse className="w-1/3 h-3.5 rounded" />
          <div className="flex gap-2">
            <Pulse className="w-16 h-6 rounded-[8px]" />
            <Pulse className="w-20 h-6 rounded-[8px]" />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Pulse className="w-28 h-3 rounded" />
            <div className="flex gap-2">
              <Pulse className="w-8 h-8 rounded-full" />
              <Pulse className="w-20 h-8 rounded-btn" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SavedListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SavedCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ---------- Chat Skeleton ---------- */
export function ChatSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
          <Pulse className={`${i % 2 === 0 ? 'w-48' : 'w-64'} h-12 rounded-2xl`} />
        </div>
      ))}
    </div>
  );
}
