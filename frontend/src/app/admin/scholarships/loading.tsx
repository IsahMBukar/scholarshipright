// Scholarships admin loading — search + filters + data table

import { Skeleton } from '@/components/admin/ui/Skeleton';

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
      <Skeleton className="w-5 h-5 rounded" />
      <Skeleton className="flex-1 h-4" />
      <Skeleton className="w-20 h-4" />
      <Skeleton className="w-16 h-5 rounded-full" />
      <Skeleton className="w-24 h-4" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="p-6 space-y-4" role="status" aria-label="Loading scholarships">
      {/* Header + create button */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36 rounded-btn" />
      </div>

      {/* Search + filters bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 flex-1 max-w-sm rounded-btn" />
        <Skeleton className="h-10 w-28 rounded-btn" />
        <Skeleton className="h-10 w-28 rounded-btn" />
        <Skeleton className="h-10 w-28 rounded-btn" />
      </div>

      {/* DataTable skeleton */}
      <div className="bg-white rounded-card border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="flex-1 h-3" />
          <Skeleton className="w-20 h-3" />
          <Skeleton className="w-16 h-3" />
          <Skeleton className="w-24 h-3" />
        </div>
        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>

      <span className="sr-only">Loading scholarships</span>
    </div>
  );
}
