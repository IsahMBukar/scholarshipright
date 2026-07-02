// Groups admin loading — search + group cards list

import { Skeleton } from '@/components/admin/ui/Skeleton';

function GroupCardSkeleton() {
  return (
    <div className="bg-white rounded-card border border-gray-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
      <Skeleton className="h-3 w-24" />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="p-6 space-y-4" role="status" aria-label="Loading country groups">
      {/* Header + create button */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32 rounded-btn" />
      </div>

      {/* Search */}
      <Skeleton className="h-10 max-w-sm rounded-btn" />

      {/* Group cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <GroupCardSkeleton key={i} />
        ))}
      </div>

      <span className="sr-only">Loading country groups</span>
    </div>
  );
}
