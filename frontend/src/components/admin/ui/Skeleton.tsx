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
