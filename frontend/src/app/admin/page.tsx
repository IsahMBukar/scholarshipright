'use client';

// Overview page. Backend returns:
//   OverviewResponse { kpis: OverviewKPI[], recent_signups_7d, recent_match_computes_7d, generated_at }
//   AnalyticsResponse { range_days, series: AnalyticsSeries[], generated_at }
//
// We render the 6 KPIs as StatCards (driven by overview.kpis), then 4 charts
// from analytics.series: signups / resume_uploads / match_computes / chat_sessions.

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import AdminLayout from '@/components/admin/AdminLayout';
import StatCard from '@/components/admin/ui/StatCard';
import { StatCardSkeleton, ChartCardSkeleton } from '@/components/admin/ui/Skeleton';
import { adminApi } from '@/lib/admin/api';
import { AdminApiError } from '@/lib/admin/client';
import { CHART_COLORS } from '@/components/admin/charts/colors';
import type { KpiFormat } from '@/lib/admin/types';
import type { LinePoint } from '@/components/admin/charts/LineChart';
import type { BarDatum } from '@/components/admin/charts/BarChart';

// Lazy-load visx charts — only imported when /admin route is visited
const LineChart = dynamic(() => import('@/components/admin/charts/LineChart'), {
  loading: () => <ChartCardSkeleton />,
});
const BarChart = dynamic(() => import('@/components/admin/charts/BarChart'), {
  loading: () => <ChartCardSkeleton />,
});

function formatKpiValue(value: number, format: KpiFormat): string {
  switch (format) {
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'currency':
      return `$${value.toLocaleString()}`;
    case 'duration':
      return `${value.toFixed(1)}h`;
    case 'number':
    default:
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
      return Math.round(value).toLocaleString();
  }
}

function seriesPointsToLine(points: Array<{ date: string; value: number }>): LinePoint[] {
  return points.map((p) => ({ x: new Date(p.date), y: p.value }));
}

function seriesPointsToBar(points: Array<{ date: string; value: number }>, days = 14): BarDatum[] {
  return points.slice(-days).map((p) => {
    const d = new Date(p.date);
    return {
      label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      value: p.value,
    };
  });
}

export default function AdminOverviewPage() {
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => adminApi.getOverview(),
  });
  const analytics = useQuery({
    queryKey: ['admin', 'analytics', 30],
    queryFn: () => adminApi.getAnalytics(30),
  });

  // Pull series by key from the analytics response.
  const seriesByKey = useMemo(() => {
    const map: Record<string, Array<{ date: string; value: number }>> = {};
    for (const s of analytics.data?.series ?? []) {
      map[s.key] = s.points;
    }
    return map;
  }, [analytics.data]);

  const signupsPoints = seriesPointsToLine(seriesByKey['signups'] ?? []);
  const resumesPoints = seriesPointsToLine(seriesByKey['resume_uploads'] ?? []);
  const matchesPoints = seriesPointsToLine(seriesByKey['match_computes'] ?? []);
  const agentDaily = seriesPointsToBar(seriesByKey['chat_sessions'] ?? []);

  const kpis = overview.data?.kpis ?? [];

  const isLoading = overview.isLoading && !overview.data;
  const errorMessage =
    (overview.error as AdminApiError | null)?.message ||
    (analytics.error as AdminApiError | null)?.message ||
    null;

  return (
    <AdminLayout title="Overview" description="Platform-wide signals and engagement">
      {isLoading ? (
        <div className="space-y-6">
          {/* KPI skeletons — 6 placeholders matching the eventual tile count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          {/* Chart skeletons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCardSkeleton />
            <ChartCardSkeleton />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCardSkeleton />
            <ChartCardSkeleton />
          </div>
        </div>
      ) : errorMessage ? (
        <div className="bg-red-50 border border-red-200 rounded-card p-5">
          <h3 className="text-sm font-semibold text-red-700 mb-1">
            Couldn&apos;t load overview
          </h3>
          <p className="text-sm text-red-600 mb-3">{errorMessage}</p>
          <button
            onClick={() => {
              overview.refetch();
              analytics.refetch();
            }}
            className="h-9 px-4 text-xs font-medium rounded-btn bg-white border border-red-200 text-red-700 hover:bg-red-50"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs — backend supplies a list of {key,label,value,format,delta} */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {kpis.map((k) => (
              <StatCard
                key={k.key}
                label={k.label}
                value={formatKpiValue(k.value, k.format)}
                delta={
                  k.delta !== null && k.delta !== undefined
                    ? { value: k.delta, label: k.delta_period ?? 'vs prior' }
                    : undefined
                }
              />
            ))}
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-card border border-gray-200 p-5">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-text-primary">New sign-ups (30d)</h2>
                <p className="text-xs text-text-secondary">Daily user registrations</p>
              </div>
              <LineChart data={signupsPoints} color={CHART_COLORS.primary} />
            </div>
            <div className="bg-white rounded-card border border-gray-200 p-5">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-text-primary">Resumes uploaded (30d)</h2>
                <p className="text-xs text-text-secondary">Daily resume submissions</p>
              </div>
              <LineChart data={resumesPoints} color={CHART_COLORS.info} />
            </div>
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-card border border-gray-200 p-5">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-text-primary">Matches computed (30d)</h2>
                <p className="text-xs text-text-secondary">Daily match recomputations</p>
              </div>
              <LineChart data={matchesPoints} color={CHART_COLORS.positive} />
            </div>
            <div className="bg-white rounded-card border border-gray-200 p-5">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-text-primary">Chat sessions (last 14d)</h2>
                <p className="text-xs text-text-secondary">Daily agent activity</p>
              </div>
              <BarChart
                data={agentDaily}
                color={CHART_COLORS.series[4]}
                yFormat={(n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))}
              />
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
