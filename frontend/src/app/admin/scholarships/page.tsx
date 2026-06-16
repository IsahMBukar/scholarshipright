'use client';

// Scholarships admin page.
// - DataTable over /api/admin/scholarships (paginated, sortable, filterable).
// - Top search + active/verified/funding filters.
// - Click row → drawer with edit form (is_active, is_verified, name, host_country,
//   funding_type, deadline, official_url). Save → PATCH /api/admin/scholarships/{id}.
// - Bulk-activate / bulk-deactivate via the DataTable toolbar.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import { Calendar, Globe, CheckCircle2, XCircle, ExternalLink, RotateCw } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { type Column } from '@/components/admin/ui/DataTable';
import Badge, { type BadgeTone } from '@/components/admin/ui/Badge';
import Button from '@/components/admin/ui/Button';
import Drawer from '@/components/admin/ui/Drawer';
import { useToast } from '@/components/admin/ui/Toast';
import { adminApi, type ListScholarshipsParams } from '@/lib/admin/api';
import { AdminApiError } from '@/lib/admin/client';
import SearchInput from '@/components/admin/ui/SearchInput';
import type { AdminScholarship } from '@/lib/admin/types';

const FUNDING_OPTIONS = [
  'fully_funded',
  'partially_funded',
  'tuition_only',
  'self_funded',
  'loan',
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}

function deadlineTone(iso: string | null): BadgeTone {
  if (!iso) return 'neutral';
  const d = new Date(iso).getTime();
  const now = Date.now();
  if (d < now) return 'negative';
  if (d < now + 7 * 24 * 60 * 60 * 1000) return 'warning';
  if (d < now + 30 * 24 * 60 * 60 * 1000) return 'info';
  return 'positive';
}

export default function AdminScholarshipsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [verifiedFilter, setVerifiedFilter] = useState<'' | 'true' | 'false'>('');
  const [fundingFilter, setFundingFilter] = useState<string>('');
  const [sort, setSort] = useState<ListScholarshipsParams['sort']>('newest');
  const [selected, setSelected] = useState<AdminScholarship | null>(null);

  const params: ListScholarshipsParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      search: search || undefined,
      is_active: activeFilter ? activeFilter === 'true' : undefined,
      is_verified: verifiedFilter ? verifiedFilter === 'true' : undefined,
      funding_type: fundingFilter || undefined,
      sort,
    }),
    [page, pageSize, search, activeFilter, verifiedFilter, fundingFilter, sort]
  );

  const scholarships = useQuery({
    queryKey: ['admin', 'scholarships', params],
    queryFn: () => adminApi.listScholarships(params),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof adminApi.patchScholarship>[1] }) =>
      adminApi.patchScholarship(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'scholarships'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });

  // Map DataTable sort → backend sort enum.
  const mapSort = (key: string | null, dir: 'asc' | 'desc' | null): ListScholarshipsParams['sort'] => {
    if (key === 'name' && dir === 'asc') return 'name';
    if (key === 'deadline' && dir === 'asc') return 'deadline_asc';
    if (key === 'created_at' && dir === 'asc') return 'oldest';
    return 'newest';
  };

  const columns: Column<AdminScholarship>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Scholarship',
        accessor: (r) => r.name,
        cell: (r) => (
          <div className="flex flex-col">
            <span className="font-medium text-text-primary">{r.name}</span>
            <span className="text-xs text-text-secondary flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {r.host_country}
              {r.host_institution && <span className="text-text-secondary"> · {r.host_institution}</span>}
            </span>
          </div>
        ),
      },
      {
        key: 'funding_type',
        header: 'Funding',
        accessor: (r) => r.funding_type,
        cell: (r) => <Badge tone="primary">{r.funding_type.replace('_', ' ')}</Badge>,
        disableFilter: true,
      },
      {
        key: 'deadline',
        header: 'Deadline',
        accessor: (r) => r.deadline ?? '',
        cell: (r) => (
          <Badge tone={deadlineTone(r.deadline)}>
            <Calendar className="w-3 h-3" />
            {fmtDate(r.deadline)}
          </Badge>
        ),
      },
      {
        key: 'is_active',
        header: 'Status',
        accessor: (r) => (r.is_active ? 1 : 0),
        cell: (r) =>
          r.is_active ? (
            <Badge tone="positive">
              <CheckCircle2 className="w-3 h-3" /> active
            </Badge>
          ) : (
            <Badge tone="negative">
              <XCircle className="w-3 h-3" /> inactive
            </Badge>
          ),
        disableFilter: true,
      },
      {
        key: 'is_verified',
        header: 'Verified',
        accessor: (r) => (r.is_verified ? 1 : 0),
        cell: (r) =>
          r.is_verified ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <XCircle className="w-4 h-4 text-text-secondary" />
          ),
        disableFilter: true,
      },
      {
        key: 'view_count',
        header: 'Views',
        accessor: (r) => r.view_count,
        align: 'right',
        disableFilter: true,
      },
      {
        key: 'application_count',
        header: 'Apps',
        accessor: (r) => r.application_count,
        align: 'right',
        disableFilter: true,
      },
    ],
    []
  );

  const headerSearch = (
    <SearchInput
      value={search}
      onChange={(v) => {
        setSearch(v);
        setPage(1);
      }}
      label="Search scholarships"
      placeholder="Search by name or provider"
      widthClass="w-72"
    />
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      <select
        value={activeFilter}
        onChange={(e) => {
          setActiveFilter(e.target.value as '' | 'true' | 'false');
          setPage(1);
        }}
        className="h-9 px-2 text-sm bg-white border border-gray-200 rounded-btn"
      >
        <option value="">All status</option>
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>
      <select
        value={verifiedFilter}
        onChange={(e) => {
          setVerifiedFilter(e.target.value as '' | 'true' | 'false');
          setPage(1);
        }}
        className="h-9 px-2 text-sm bg-white border border-gray-200 rounded-btn"
      >
        <option value="">All verification</option>
        <option value="true">Verified</option>
        <option value="false">Unverified</option>
      </select>
      <select
        value={fundingFilter}
        onChange={(e) => {
          setFundingFilter(e.target.value);
          setPage(1);
        }}
        className="h-9 px-2 text-sm bg-white border border-gray-200 rounded-btn"
      >
        <option value="">All funding</option>
        {FUNDING_OPTIONS.map((f) => (
          <option key={f} value={f}>
            {f.replace('_', ' ')}
          </option>
        ))}
      </select>
      <Button
        variant="secondary"
        size="md"
        onClick={() => scholarships.refetch()}
        title="Refresh"
        aria-label="Refresh scholarships"
      >
        <RotateCw className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  // Bulk-action toolbar: activate / deactivate selected rows.
  const bulkActions = useCallback(
    (rows: AdminScholarship[]) => (
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={patch.isPending}
          onClick={() => {
            const ids = rows.map((r) => r.id);
            Promise.allSettled(
              ids.map((id) => patch.mutateAsync({ id, body: { is_active: true } }))
            ).then((results) => {
              const ok = results.filter((r) => r.status === 'fulfilled').length;
              const failed = results.length - ok;
              if (failed === 0) {
                toast.success(
                  `Activated ${ok} scholarship${ok === 1 ? '' : 's'}`,
                );
              } else {
                toast.warning(
                  `Activated ${ok}, ${failed} failed`,
                  'Check the audit log for details.',
                );
              }
            });
          }}
        >
          Activate
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={patch.isPending}
          onClick={() => {
            const ids = rows.map((r) => r.id);
            Promise.allSettled(
              ids.map((id) => patch.mutateAsync({ id, body: { is_active: false } }))
            ).then((results) => {
              const ok = results.filter((r) => r.status === 'fulfilled').length;
              const failed = results.length - ok;
              if (failed === 0) {
                toast.success(
                  `Deactivated ${ok} scholarship${ok === 1 ? '' : 's'}`,
                );
              } else {
                toast.warning(
                  `Deactivated ${ok}, ${failed} failed`,
                  'Check the audit log for details.',
                );
              }
            });
          }}
        >
          Deactivate
        </Button>
      </div>
    ),
    [patch, toast]
  );

  return (
    <AdminLayout
      title="Scholarships"
      description="Catalog moderation and health"
      actions={headerActions}
    >
      <div className="space-y-3">
        {headerSearch}
        <DataTable
          rows={scholarships.data?.items ?? []}
          total={scholarships.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          columns={columns}
          isLoading={scholarships.isLoading}
          error={(scholarships.error as AdminApiError | null)?.message ?? null}
          keyExtractor={(r) => r.id}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          onSortChange={(key, dir) => {
            setSort(mapSort(key, dir));
            setPage(1);
          }}
          onRowClick={(r) => setSelected(r)}
          toolbar={bulkActions}
          emptyMessage="No scholarships match the current filters."
        />
      </div>

      <ScholarshipDrawer
        scholarship={selected}
        onClose={() => setSelected(null)}
        onSave={async (body) => {
          if (!selected) return;
          try {
            await patch.mutateAsync({ id: selected.id, body });
            toast.success('Scholarship updated', selected.name);
            setSelected(null);
          } catch (err) {
            const msg = err instanceof AdminApiError ? err.message : 'Update failed';
            toast.error('Failed to update scholarship', msg);
            throw err;
          }
        }}
        saving={patch.isPending}
        saveError={(patch.error as AdminApiError | null)?.message ?? null}
      />
    </AdminLayout>
  );
}

function ScholarshipDrawer({
  scholarship,
  onClose,
  onSave,
  saving,
  saveError,
}: {
  scholarship: AdminScholarship | null;
  onClose: () => void;
  onSave: (body: {
    is_active?: boolean;
    is_verified?: boolean;
    name?: string;
    host_country?: string;
    funding_type?: string;
    deadline?: string;
    official_url?: string;
  }) => Promise<void>;
  saving: boolean;
  saveError: string | null;
}) {
  const [name, setName] = useState('');
  const [hostCountry, setHostCountry] = useState('');
  const [fundingType, setFundingType] = useState('');
  const [deadline, setDeadline] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isVerified, setIsVerified] = useState(false);

  // Sync local form state when row changes
  useMemo(() => {
    if (!scholarship) return;
    setName(scholarship.name);
    setHostCountry(scholarship.host_country);
    setFundingType(scholarship.funding_type);
    setDeadline(scholarship.deadline ? scholarship.deadline.slice(0, 10) : '');
    setOfficialUrl(scholarship.official_url);
    setIsActive(scholarship.is_active);
    setIsVerified(scholarship.is_verified);
  }, [scholarship]);

  const handleSave = useCallback(() => {
    onSave({
      is_active: isActive,
      is_verified: isVerified,
      name: name.trim() || undefined,
      host_country: hostCountry.trim() || undefined,
      funding_type: fundingType || undefined,
      deadline: deadline || undefined,
      official_url: officialUrl.trim() || undefined,
    });
  }, [isActive, isVerified, name, hostCountry, fundingType, deadline, officialUrl, onSave]);

  return (
    <Drawer
      open={!!scholarship}
      onClose={onClose}
      title={scholarship ? 'Edit scholarship' : ''}
      widthClass="w-[520px]"
      footer={
        scholarship ? (
          <div className="flex items-center justify-between gap-2">
            <a
              href={scholarship.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-secondary hover:text-primary inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Open official page
            </a>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} loading={saving}>
                Save changes
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {scholarship && (
        <div className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wide text-text-secondary mb-1 block">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary mb-1 block">
                Host country
              </label>
              <input
                value={hostCountry}
                onChange={(e) => setHostCountry(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary mb-1 block">
                Funding type
              </label>
              <select
                value={fundingType}
                onChange={(e) => setFundingType(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {FUNDING_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary mb-1 block">
                Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-secondary mb-1 block">
                Official URL
              </label>
              <input
                value={officialUrl}
                onChange={(e) => setOfficialUrl(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>Active (visible to users)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isVerified}
                onChange={(e) => setIsVerified(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>Verified</span>
            </label>
          </div>

          <div className="text-xs text-text-secondary pt-2 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-y-1">
              <span>Views:</span>
              <span className="font-mono">{scholarship.view_count.toLocaleString()}</span>
              <span>Applications:</span>
              <span className="font-mono">{scholarship.application_count.toLocaleString()}</span>
              <span>Source:</span>
              <span className="truncate">{scholarship.source ?? '—'}</span>
            </div>
          </div>

          {saveError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
              {saveError}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
