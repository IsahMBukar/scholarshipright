// Skeleton placeholder. Matches StatCard sizing so the loading state doesn't
// jump when real data arrives.

import { type CSSProperties } from 'react';
import clsx from 'clsx';

export interface SkeletonProps {
  className?: string;
  // Inline style override (e.g. for height on chart placeholders).
  style?: CSSProperties;
  // Renders a circular skeleton (avatars, icon placeholders).
  rounded?: boolean;
}

export function Skeleton({ className, style, rounded }: SkeletonProps) {
  return (
    <div
      style={style}
      className={clsx(
        'bg-gray-100 animate-pulse',
        rounded ? 'rounded-full' : 'rounded',
        className
      )}
    />
  );
}

// Convenience: a StatCard-shaped skeleton.
export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-card border border-gray-200 p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-16 mt-3" />
      <Skeleton className="h-3 w-20 mt-3" />
    </div>
  );
}

// Convenience: a chart card skeleton (title + chart body).
export function ChartCardSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="bg-white rounded-card border border-gray-200 p-5">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-3 w-20 mt-2" />
      <Skeleton className="mt-4" style={{ height: `${height}px` }} />
    </div>
  );
}

/* ============================================================
   AdminPageSkeleton — the ONE loading pattern for /admin/*
   ============================================================
   Every admin route-level loading.tsx renders exactly one
   <AdminPageSkeleton variant="..." /> so navigation between
   admin pages shows a consistent loading experience.

   Variants:
     - 'dashboard'  KPI stat cards + chart grid   (/) 
     - 'table'      toolbar + data-table rows      (users, scholarships, audit, invites, blogs, review)
     - 'cards'      card grid                      (groups)
     - 'centered'   gold branded spinner           (fast routes: accept-invite, mcp)
     - 'shell'      sidebar+topbar+content shell   (AdminLayout auth check)
   ============================================================ */

import { Loader2 } from 'lucide-react';

export type AdminLoadingVariant = 'dashboard' | 'table' | 'cards' | 'centered' | 'shell';

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
      <Skeleton className="w-8 h-8 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="w-16 h-5 rounded-full" />
      <Skeleton className="w-20 h-5 rounded-full" />
      <Skeleton className="w-24 h-4" />
    </div>
  );
}

function TableHeaderRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50">
      <Skeleton className="w-8 h-3" />
      <Skeleton className="flex-1 h-3" />
      <Skeleton className="w-16 h-3" />
      <Skeleton className="w-20 h-3" />
      <Skeleton className="w-24 h-3" />
    </div>
  );
}

function Toolbar() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 flex-1 max-w-sm rounded-btn" />
      <Skeleton className="h-10 w-24 rounded-btn" />
      <Skeleton className="h-10 w-24 rounded-btn" />
      <Skeleton className="h-10 w-28 rounded-btn" />
    </div>
  );
}

function Pagination() {
  return (
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-32" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
  );
}

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

export function AdminPageSkeleton({
  variant,
  label,
}: {
  variant: AdminLoadingVariant;
  label?: string;
}) {
  if (variant === 'dashboard') {
    return (
      <div className="p-6 space-y-6" role="status" aria-label="Loading dashboard">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ChartCardSkeleton key={i} />
          ))}
        </div>
        <span className="sr-only">Loading dashboard</span>
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="p-6 space-y-4" role="status" aria-label="Loading page">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-36 rounded-btn" />
        </div>
        <Toolbar />
        <div className="bg-white rounded-card border border-gray-200 overflow-hidden">
          <TableHeaderRow />
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRowSkeleton key={i} />
          ))}
        </div>
        <Pagination />
        <span className="sr-only">Loading page</span>
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className="p-6 space-y-4" role="status" aria-label="Loading cards">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32 rounded-btn" />
        </div>
        <Skeleton className="h-10 max-w-sm rounded-btn" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <GroupCardSkeleton key={i} />
          ))}
        </div>
        <span className="sr-only">Loading cards</span>
      </div>
    );
  }

  if (variant === 'centered') {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6" role="status" aria-live="polite">
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

  // 'shell' — matches AdminLayout's chrome while the auth check resolves
  return (
    <div className="h-screen bg-gray-100 flex" role="status" aria-label="Loading admin">
      <div className="hidden md:flex flex-col w-64 h-full bg-white border-r border-gray-200">
        <div className="flex items-center gap-3 h-16 px-5 border-b border-gray-200">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        <div className="flex-1 p-3 space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-btn" />
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="h-16 border-b border-gray-200 bg-white/80 flex items-center px-6">
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-card border border-gray-200 p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-16 mt-3" />
                <Skeleton className="h-3 w-20 mt-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
