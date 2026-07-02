// Invites admin loading — invite form + data table

import { Skeleton } from '@/components/admin/ui/Skeleton';

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
      <Skeleton className="w-6 h-6 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="w-16 h-5 rounded-full" />
      <Skeleton className="w-16 h-5 rounded-full" />
      <Skeleton className="w-20 h-4" />
      <Skeleton className="w-8 h-8 rounded" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="p-6 space-y-4" role="status" aria-label="Loading invites">
      {/* Header */}
      <Skeleton className="h-8 w-36" />

      {/* Invite form */}
      <div className="bg-white rounded-card border border-gray-200 p-5 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-10 w-full rounded-btn" />
          </div>
          <div className="w-40 space-y-1.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-10 w-full rounded-btn" />
          </div>
          <Skeleton className="h-10 w-28 rounded-btn" />
        </div>
      </div>

      {/* DataTable skeleton */}
      <div className="bg-white rounded-card border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <Skeleton className="w-6 h-3" />
          <Skeleton className="flex-1 h-3" />
          <Skeleton className="w-16 h-3" />
          <Skeleton className="w-16 h-3" />
          <Skeleton className="w-20 h-3" />
          <Skeleton className="w-8 h-3" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>

      <span className="sr-only">Loading invites</span>
    </div>
  );
}
