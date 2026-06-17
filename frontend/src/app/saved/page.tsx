'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { ScholarshipListSkeleton } from '@/components/Skeletons';
import {
  fetchSavedScholarships,
  fetchApplicationStats,
  updateSavedScholarship,
  removeSavedScholarship,
} from '@/services/api';
import type { Scholarship, ApplicationStats } from '@/services/api';

type SavedItem = Scholarship & {
  status: string;
  notes?: string;
  reminder_enabled: boolean;
  saved_id?: string;
  scholarship_id?: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string; next?: string }> = {
  saved:     { label: 'Saved',     color: 'text-gray-600',    bg: 'bg-gray-100',    icon: 'bookmark', next: 'applying' },
  applying:  { label: 'Applying',  color: 'text-blue-600',    bg: 'bg-blue-50',     icon: 'edit_note', next: 'applied' },
  applied:   { label: 'Applied',   color: 'text-emerald-600', bg: 'bg-emerald-50',  icon: 'check_circle', next: 'reviewing' },
  reviewing: { label: 'Reviewing', color: 'text-amber-600',   bg: 'bg-amber-50',    icon: 'hourglass_top', next: 'accepted' },
  accepted:  { label: 'Accepted',  color: 'text-green-600',   bg: 'bg-green-50',    icon: 'celebration' },
  rejected:  { label: 'Rejected',  color: 'text-red-500',     bg: 'bg-red-50',      icon: 'cancel' },
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active', statuses: 'saved,applying,applied,reviewing' },
  { key: 'saved', label: 'Saved' },
  { key: 'applied', label: 'Applied', statuses: 'applied,reviewing' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
];

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [stats, setStats] = useState<ApplicationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [savedData, statsData] = await Promise.all([
        fetchSavedScholarships(),
        fetchApplicationStats().catch(() => null),
      ]);
      setSaved(savedData as SavedItem[]);
      if (statsData) setStats(statsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(scholarshipId: string, newStatus: string) {
    setUpdatingId(scholarshipId);
    try {
      await updateSavedScholarship(scholarshipId, { status: newStatus });
      setSaved((prev) =>
        prev.map((s) =>
          (s.id === scholarshipId || s.scholarship_id === scholarshipId)
            ? { ...s, status: newStatus }
            : s
        )
      );
      // Refresh stats
      const statsData = await fetchApplicationStats().catch(() => null);
      if (statsData) setStats(statsData);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRemove(scholarshipId: string) {
    await removeSavedScholarship(scholarshipId).catch(() => {});
    setSaved((prev) => prev.filter((s) => s.id !== scholarshipId && s.scholarship_id !== scholarshipId));
    const statsData = await fetchApplicationStats().catch(() => null);
    if (statsData) setStats(statsData);
  }

  // Filter by tab
  const filtered = activeTab === 'all'
    ? saved
    : activeTab === 'active'
    ? saved.filter((s) => ['saved', 'applying', 'applied', 'reviewing'].includes(s.status))
    : activeTab === 'applied'
    ? saved.filter((s) => ['applied', 'reviewing'].includes(s.status))
    : saved.filter((s) => s.status === activeTab);

  return (
    <AppLayout>
      <div className="px-4 md:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[24px] font-bold text-text-primary mb-1">Application Tracker</h1>
          <p className="text-[14px] text-text-secondary">Track your scholarship applications from save to acceptance</p>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            {[
              { label: 'Total', value: stats.total, color: 'text-text-primary' },
              { label: 'Saved', value: stats.saved, color: 'text-gray-600' },
              { label: 'Applying', value: stats.applying, color: 'text-blue-600' },
              { label: 'Applied', value: stats.applied, color: 'text-emerald-600' },
              { label: 'Reviewing', value: stats.reviewing, color: 'text-amber-600' },
              { label: 'Accepted', value: stats.accepted, color: 'text-green-600' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                <p className={`text-[22px] font-extrabold ${stat.color}`}>{stat.value}</p>
                <p className="text-[11px] text-text-secondary font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
          {TABS.map((tab) => {
            const count = tab.key === 'all'
              ? saved.length
              : tab.key === 'active'
              ? saved.filter((s) => ['saved', 'applying', 'applied', 'reviewing'].includes(s.status)).length
              : tab.key === 'applied'
              ? saved.filter((s) => ['applied', 'reviewing'].includes(s.status)).length
              : saved.filter((s) => s.status === tab.key).length;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'bg-text-primary text-text-inverse'
                    : 'bg-white text-text-secondary hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-[11px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading ? (
          <ScholarshipListSkeleton count={4} />
        ) : filtered.length > 0 ? (
          <div className="flex flex-col gap-3">
            {filtered.map((sch) => (
              <ApplicationCard
                key={sch.id || sch.scholarship_id}
                scholarship={sch}
                onStatusChange={handleStatusChange}
                onRemove={handleRemove}
                isUpdating={updatingId === (sch.id || sch.scholarship_id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-text-secondary mb-4 block">
              {activeTab === 'all' ? 'bookmark_border' : 'filter_list_off'}
            </span>
            <p className="text-[16px] text-text-secondary">
              {activeTab === 'all'
                ? 'No saved scholarships yet'
                : `No ${activeTab} applications`}
            </p>
            {activeTab !== 'all' && (
              <button
                onClick={() => setActiveTab('all')}
                className="mt-3 text-[13px] text-primary font-medium hover:underline"
              >
                Show all
              </button>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/* ─── Application Card ─── */
function ApplicationCard({
  scholarship: sch,
  onStatusChange,
  onRemove,
  isUpdating,
}: {
  scholarship: SavedItem;
  onStatusChange: (id: string, status: string) => void;
  onRemove: (id: string) => void;
  isUpdating: boolean;
}) {
  const statusConfig = STATUS_CONFIG[sch.status] || STATUS_CONFIG.saved;
  const schId = sch.scholarship_id || sch.id;
  const deadline = sch.deadline || (sch as any).scholarship_deadline;
  const daysUntilDeadline = deadline
    ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Status icon */}
        <div className={`w-10 h-10 rounded-xl ${statusConfig.bg} flex items-center justify-center flex-shrink-0`}>
          <span className={`material-symbols-outlined text-[20px] ${statusConfig.color}`}>
            {statusConfig.icon}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/scholarships/${sch.slug}`}>
                <h3 className="text-[15px] font-bold text-text-primary hover:text-primary transition-colors line-clamp-1">
                  {sch.name}
                </h3>
              </Link>
              <p className="text-[12px] text-text-secondary mt-0.5">
                {sch.host_country} · {sch.funding_type === 'fully_funded' ? 'Fully Funded' : sch.funding_type}
              </p>
            </div>

            {/* Status badge */}
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusConfig.bg} ${statusConfig.color} whitespace-nowrap`}>
              <span className="material-symbols-outlined text-[13px]">{statusConfig.icon}</span>
              {statusConfig.label}
            </span>
          </div>

          {/* Deadline */}
          {deadline && (
            <p className={`text-[12px] mt-2 ${
              daysUntilDeadline !== null && daysUntilDeadline <= 14
                ? 'text-red-500 font-semibold'
                : daysUntilDeadline !== null && daysUntilDeadline <= 30
                ? 'text-amber-600'
                : 'text-text-secondary'
            }`}>
              {daysUntilDeadline !== null && daysUntilDeadline <= 0
                ? 'Deadline passed'
                : daysUntilDeadline !== null
                ? `${daysUntilDeadline} days left · ${new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : `Deadline: ${new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          )}

          {/* Actions row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {/* Next status button */}
            {statusConfig.next && (
              <button
                onClick={() => onStatusChange(schId, statusConfig.next!)}
                disabled={isUpdating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {STATUS_CONFIG[statusConfig.next]?.icon || 'arrow_forward'}
                </span>
                {statusConfig.next === 'applying' && 'Start Applying'}
                {statusConfig.next === 'applied' && 'Mark as Applied'}
                {statusConfig.next === 'reviewing' && 'Mark as Reviewing'}
                {statusConfig.next === 'accepted' && 'Mark Accepted'}
              </button>
            )}

            {/* Apply Now button (when saved or applying) */}
            {(sch.status === 'saved' || sch.status === 'applying') && sch.official_url && (
              <Link
                href={sch.official_url}
                target="_blank"
                onClick={() => {
                  if (sch.status === 'saved') onStatusChange(schId, 'applying');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-text-primary text-[12px] font-semibold rounded-lg hover:bg-gray-50 transition-all"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                Apply Now
              </Link>
            )}

            {/* Status dropdown */}
            <StatusDropdown
              currentStatus={sch.status}
              onSelect={(status) => onStatusChange(schId, status)}
              disabled={isUpdating}
            />

            {/* Remove */}
            <button
              onClick={() => onRemove(schId)}
              className="ml-auto p-1.5 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove"
            >
              <span className="material-symbols-outlined text-[16px]">delete_outline</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Status Dropdown ─── */
function StatusDropdown({
  currentStatus,
  onSelect,
  disabled,
}: {
  currentStatus: string;
  onSelect: (status: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  const statuses = ['saved', 'applying', 'applied', 'reviewing', 'accepted', 'rejected'];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 text-text-secondary text-[12px] font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
        Change
        <span className="material-symbols-outlined text-[14px]">{open ? 'expand_less' : 'expand_more'}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-50 py-1 min-w-[160px]">
            {statuses.map((status) => {
              const config = STATUS_CONFIG[status];
              return (
                <button
                  key={status}
                  onClick={() => { onSelect(status); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-gray-50 transition-colors ${
                    status === currentStatus ? 'bg-gray-50 font-semibold' : ''
                  }`}
                >
                  <span className={`material-symbols-outlined text-[16px] ${config.color}`}>{config.icon}</span>
                  <span className="text-text-primary">{config.label}</span>
                  {status === currentStatus && (
                    <span className="material-symbols-outlined text-[14px] text-primary ml-auto">check</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
