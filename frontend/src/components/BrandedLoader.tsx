/* ============================================================
   BrandedLoader — shared loader shells for route-level loading.tsx
   ============================================================

   Two variants:

   - <BrandedLoader />            Full-screen centered spinner with brand
                                  gold accent. Use for marketing /
                                  auth-style routes where the page is
                                  expected to render fast and a quick
                                  spinner is less jarring than a
                                  skeleton.

   - <SkeletonPage variant="…" /> Branded skeleton matching the actual
                                  page shape. Used for routes where the
                                  initial render is meaningfully delayed
                                  (data fetching, heavy client widgets).

   Per the project's UX rule: no plain "Loading..." text — every loading
   state is either a branded spinner or a structural skeleton. */

import { Loader2 } from 'lucide-react';

type Surface = 'app' | 'brand';
type Variant = 'spinner' | 'list' | 'detail' | 'form' | 'dashboard';

interface BrandedLoaderProps {
  surface?: Surface;
  label?: string;
}

/**
 * Full-screen branded spinner. Default fallback for routes that load
 * quickly enough that a skeleton would feel like overkill.
 */
export function BrandedLoader({ surface = 'app', label }: BrandedLoaderProps) {
  const bg = surface === 'brand' ? 'bg-surface-brand' : 'bg-surface-app';
  return (
    <div className={`min-h-screen flex items-center justify-center ${bg}`} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary-readable" aria-hidden="true" />
        {label ? (
          <span className="text-sm text-text-secondary">{label}</span>
        ) : (
          <span className="sr-only">Loading</span>
        )}
      </div>
    </div>
  );
}

interface SkeletonPageProps {
  variant: Variant;
  surface?: Surface;
}

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200/80 ${className}`} aria-hidden="true" />;
}

/**
 * Structural skeleton matching common page shapes. Reduces CLS by
 * rendering content-area placeholders before hydration completes.
 */
export function SkeletonPage({ variant, surface = 'app' }: SkeletonPageProps) {
  const bg = surface === 'brand' ? 'bg-surface-brand' : 'bg-surface-app';

  if (variant === 'list') {
    return (
      <div className={`min-h-screen ${bg} p-4 md:p-8`} role="status" aria-label="Loading scholarships">
        <div className="max-w-7xl mx-auto space-y-6">
          <Pulse className="w-48 h-8" />
          <Pulse className="w-full h-12 rounded-btn" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-card bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-5 space-y-3">
                <Pulse className="w-16 h-16 rounded-chip" />
                <Pulse className="w-3/4 h-5" />
                <Pulse className="w-1/2 h-4" />
                <Pulse className="w-full h-10 rounded-btn mt-3" />
              </div>
            ))}
          </div>
        </div>
        <span className="sr-only">Loading scholarships</span>
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className={`min-h-screen ${bg} p-4 md:p-8`} role="status" aria-label="Loading scholarship details">
        <div className="max-w-4xl mx-auto space-y-5">
          <Pulse className="w-32 h-5" />
          <div className="flex gap-4">
            <Pulse className="w-20 h-20 rounded-chip flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <Pulse className="w-2/3 h-7" />
              <Pulse className="w-1/3 h-4" />
              <div className="flex gap-2">
                <Pulse className="w-20 h-7 rounded-[10px]" />
                <Pulse className="w-24 h-7 rounded-[10px]" />
              </div>
            </div>
          </div>
          <Pulse className="w-full h-40 rounded-card" />
          <Pulse className="w-full h-32 rounded-card" />
        </div>
        <span className="sr-only">Loading details</span>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className={`min-h-screen ${bg} p-4 md:p-8`} role="status" aria-label="Loading">
        <div className="max-w-2xl mx-auto space-y-5">
          <Pulse className="w-48 h-7" />
          <Pulse className="w-72 h-4" />
          <div className="rounded-card bg-white p-6 space-y-4">
            <Pulse className="w-full h-11 rounded-btn" />
            <Pulse className="w-full h-11 rounded-btn" />
            <Pulse className="w-full h-11 rounded-btn" />
            <Pulse className="w-32 h-10 rounded-btn" />
          </div>
        </div>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  // dashboard
  return (
    <div className={`min-h-screen ${bg} p-4 md:p-8`} role="status" aria-label="Loading dashboard">
      <div className="max-w-7xl mx-auto space-y-6">
        <Pulse className="w-56 h-8" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Pulse key={i} className="h-28 rounded-card" />
          ))}
        </div>
        <Pulse className="w-full h-64 rounded-card" />
      </div>
      <span className="sr-only">Loading dashboard</span>
    </div>
  );
}

export default BrandedLoader;
