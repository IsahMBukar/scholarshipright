'use client';

// Overview page. KPI cards + signups line chart + agent activity bar/donut.

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Users, GraduationCap, FileText, MessageSquare, Bookmark, Activity } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import StatCard from '@/components/admin/ui/StatCard';
import LineChart, { type LinePoint } from '@/components/admin/charts/LineChart';
import BarChart, { type BarDatum } from '@/components/admin/charts/BarChart';
import DonutChart, { type DonutSlice } from '@/components/admin/charts/DonutChart';
import { adminApi } from '@/lib/admin/api';
import { AdminApiError } from '@/lib/admin/client';

function pctChange(current: number, baseline: number): number {
  if (baseline <= 0) return current > 0 ? 100 : 0;
  return ((current - baseline) / baseline) * 100;
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

  const signupsPoints: LinePoint[] = useMemo(
    () =>
      (analytics.data?.signups_daily ?? []).map((p) => ({
        x: new Date(p.date),
        y: p.value,
      })),
    [analytics.data]
  );
  const resumesPoints: LinePoint[] = useMemo(
    () =>
      (analytics.data?.resumes_uploaded_daily ?? []).map((p) => ({
        x: new Date(p.date),
        y: p.value,
      })),
    [analytics.data]
  );

  const agentDaily: BarDatum[] = useMemo(
    () =>
      (analytics.data?.agent_messages_daily ?? []).slice(-14).map((p) => ({
        label: new Date(p.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        value: p.value,
      })),
    [analytics.data]
  );

  const overview_ = overview.data;
  const newUsersDelta = overview_
    ? pctChange(overview_.new_users_7d, Math.max(overview_.total_users - overview_.new_users_7d, 1))
    : 0;
  const resumesDelta = overview_
    ? pctChange(
        overview_.resumes_analyzed_7d,
        Math.max(overview_.total_resumes - overview_.resumes_analyzed_7d, 1)
      )
    : 0;
  const matchesDelta = overview_
    ? pctChange(
        overview_.matches_computed_7d,
        Math.max(overview_.total_matches_computed - overview_.matches_computed_7d, 1)
      )
    : 0;

  const isLoading = overview.isLoading || analytics.isLoading;
  const errorMessage =
    (overview.error as AdminApiError | null)?.message ||
    (analytics.error as AdminApiError | null)?.message ||
    null;

  const donutData: DonutSlice[] = overview_
    ? [
        { label: 'Active', value: overview_.active_users_7d },
        { label: 'Dormant', value: Math.max(overview_.total_users - overview_.active_users_7d, 0) },
      ]
    : [];

  return (
    <AdminLayout
      title="Overview"
      description="Platform-wide signals and engagement"
    >
      {isLoading && !overview.data && !analytics.data ? (
        <div className="text-sm text-text-secondary">Loading overview…</div>
      ) : errorMessage ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-card p-4">
          {errorMessage}
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <StatCard
              label="Total users"
              value={overview_?.total_users ?? 0}
              delta={{ value: newUsersDelta, label: 'vs prior' }}
              hint={`${overview_?.new_users_7d ?? 0} new in 7d`}
              icon={<Users className="w-4 h-4" />}
            />
            <StatCard
              label="Active users (7d)"
              value={overview_?.active_users_7d ?? 0}
              hint="had activity in last 7 days"
              icon={<Activity className="w-4 h-4" />}
            />
            <StatCard
              label="Scholarships"
              value={overview_?.total_scholarships ?? 0}
              hint={`${overview_?.active_scholarships ?? 0} active`}
              icon={<GraduationCap className="w-4 h-4" />}
            />
            <StatCard
              label="Resumes analyzed"
              value={overview_?.total_resumes ?? 0}
              delta={{ value: resumesDelta, label: '7d' }}
              hint={`${overview_?.resumes_analyzed_7d ?? 0} in 7d`}
              icon={<FileText className="w-4 h-4" />}
            />
            <StatCard
              label="Matches computed"
              value={overview_?.total_matches_computed ?? 0}
              delta={{ value: matchesDelta, label: '7d' }}
              hint={`${overview_?.matches_computed_7d ?? 0} in 7d`}
              icon={<Bookmark className="w-4 h-4" />}
            />
            <StatCard
              label="Agent sessions"
              value={overview_?.total_agent_sessions ?? 0}
              hint="all time"
              icon={<MessageSquare className="w-4 h-4" />}
            />
            <StatCard
              label="Saved scholarships"
              value={overview_?.total_saved_scholarships ?? 0}
              hint="all time"
              icon={<Bookmark className="w-4 h-4" />}
            />
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-card border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">Signups (30d)</h2>
                  <p className="text-xs text-text-secondary">Daily new user registrations</p>
                </div>
              </div>
              <LineChart data={signupsPoints} />
            </div>
            <div className="bg-white rounded-card border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">Resumes uploaded (30d)</h2>
                  <p className="text-xs text-text-secondary">Daily resume submissions</p>
                </div>
              </div>
              <LineChart data={resumesPoints} color="#3b82f6" />
            </div>
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-card border border-gray-200 p-5">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-text-primary">Agent messages (last 14d)</h2>
                <p className="text-xs text-text-secondary">Daily AI agent traffic</p>
              </div>
              <BarChart data={agentDaily} color="#10b981" yFormat={(n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))} />
            </div>
            <div className="bg-white rounded-card border border-gray-200 p-5">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-text-primary">User engagement</h2>
                <p className="text-xs text-text-secondary">Active vs dormant in 7d</p>
              </div>
              <DonutChart
                data={donutData}
                centerValue={String(overview_?.active_users_7d ?? 0)}
                centerLabel="active 7d"
              />
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
