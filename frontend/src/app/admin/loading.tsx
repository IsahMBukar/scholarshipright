// Dashboard loading — 6 KPI stat cards + 2 chart cards

import { Skeleton, StatCardSkeleton, ChartCardSkeleton } from '@/components/admin/ui/Skeleton';

export default function Loading() {
  return (
    <div className="p-6 space-y-6" role="status" aria-label="Loading dashboard">
      {/* Header */}
      <Skeleton className="h-8 w-48" />

      {/* 6 KPI stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* 2x2 chart grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <ChartCardSkeleton key={i} />
        ))}
      </div>

      <span className="sr-only">Loading dashboard</span>
    </div>
  );
}
