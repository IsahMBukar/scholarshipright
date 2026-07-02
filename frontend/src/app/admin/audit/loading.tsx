// Audit log loading — filters + data table with polling toggle

import { Skeleton } from '@/components/admin/ui/Skeleton';

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
      <Skeleton className="w-8 h-8 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="w-20 h-4" />
      <Skeleton className="w-8 h-8 rounded" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="p-6 space-y-4" role="status" aria-label="Loading audit log">
      {/* Header + polling toggle */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-24 rounded-btn" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-36 rounded-btn" />
        <Skeleton className="h-10 w-32 rounded-btn" />
        <Skeleton className="h-10 flex-1 max-w-xs rounded-btn" />
      </div>

      {/* DataTable skeleton */}
      <div className="bg-white rounded-card border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <Skeleton className="w-8 h-3" />
          <Skeleton className="flex-1 h-3" />
          <Skeleton className="w-20 h-3" />
          <Skeleton className="w-8 h-3" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>

      <span className="sr-only">Loading audit log</span>
    </div>
  );
}
