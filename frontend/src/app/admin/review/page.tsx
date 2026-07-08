'use client';

// Review Queue page — approve/reject pending scholarship submissions
// from MCP agents, URL scraper, or bulk import.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  ExternalLink,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { type Column } from '@/components/admin/ui/DataTable';
import Badge, { type BadgeTone } from '@/components/admin/ui/Badge';
import Button from '@/components/admin/ui/Button';
import Drawer from '@/components/admin/ui/Drawer';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/admin/ui/Toast';
import { adminApi } from '@/lib/admin/api';
import { AdminApiError } from '@/lib/admin/client';
import type { PendingScholarship, ReviewStats } from '@/lib/admin/types';

// ── Helpers ───────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'pending_review': return 'warning';
    case 'approved': return 'positive';
    case 'rejected': return 'negative';
    default: return 'neutral';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending_review': return 'Pending';
    case 'approved': return 'Approved';
    case 'rejected': return 'Rejected';
    default: return status;
  }
}

// ── Main Page ─────────────────────────────────────────────────────

export default function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const [statusFilter, setStatusFilter] = useState<string>('pending_review');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['admin', 'review', 'stats'],
    queryFn: () => adminApi.getReviewStats(),
  });

  // Fetch list
  const { data: list, isLoading, error } = useQuery({
    queryKey: ['admin', 'review', 'list', statusFilter, page],
    queryFn: () => adminApi.listPending({
      status: statusFilter || undefined,
      page,
      limit: 20,
    }),
  });

  // Fetch selected detail
  const { data: selected } = useQuery({
    queryKey: ['admin', 'review', 'detail', selectedId],
    queryFn: () => adminApi.getPending(selectedId!),
    enabled: !!selectedId,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approvePending(id, { is_active: true, is_verified: false }),
    onSuccess: () => {
      toast.success('Scholarship approved and published');
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'review'] });
    },
    onError: (err: AdminApiError) => {
      toast.error(`Approve failed: ${err.message}`);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.rejectPending(id, reason),
    onSuccess: () => {
      toast.success('Submission rejected');
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'review'] });
    },
    onError: (err: AdminApiError) => {
      toast.error(`Reject failed: ${err.message}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deletePending(id),
    onSuccess: () => {
      toast.success('Submission deleted');
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'review'] });
    },
    onError: (err: AdminApiError) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  // Approve handler
  const handleApprove = useCallback(async () => {
    if (!selected) return;
    const ok = await confirm({
      title: 'Approve Scholarship',
      description: `Publish "${selected.payload?.name || 'this scholarship'}" to the live catalog?`,
      confirmLabel: 'Approve',
      tone: 'primary',
    });
    if (ok) approveMutation.mutate(selected.id);
  }, [selected, confirm, approveMutation]);

  // Reject handler
  const handleReject = useCallback(async () => {
    if (!selected) return;
    const ok = await confirm({
      title: 'Reject Submission',
      description: `Reject "${selected.payload?.name || 'this submission'}"? This cannot be undone.`,
      confirmLabel: 'Reject',
      tone: 'danger',
    });
    if (ok) {
      rejectMutation.mutate({ id: selected.id, reason: 'Rejected by admin' });
    }
  }, [selected, confirm, rejectMutation]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!selected) return;
    const ok = await confirm({
      title: 'Delete Submission',
      description: 'This will permanently delete this submission. This action cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (ok) deleteMutation.mutate(selected.id);
  }, [selected, confirm, deleteMutation]);

  // Table columns
  const columns: Column<PendingScholarship>[] = [
    {
      key: 'name',
      header: 'Scholarship',
      accessor: (row) => row.payload?.name || 'Untitled',
      render: (row) => (
        <div className="max-w-xs">
          <div className="font-medium text-text-primary truncate">
            {row.payload?.name || 'Untitled'}
          </div>
          <div className="text-xs text-text-secondary truncate">
            {row.payload?.host_country || '—'} · {row.payload?.funding_type || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'submitted_by',
      header: 'Submitted By',
      accessor: (row) => row.submitted_by,
      render: (row) => (
        <span className="text-sm text-text-secondary">{row.submitted_by}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      render: (row) => (
        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
      ),
    },
    {
      key: 'deadline',
      header: 'Deadline',
      accessor: (row) => row.payload?.deadline || '',
      render: (row) => (
        <span className="text-sm">{row.payload?.deadline || '—'}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Submitted',
      accessor: (row) => row.created_at,
      render: (row) => (
        <span className="text-sm text-text-secondary">{fmtDate(row.created_at)}</span>
      ),
    },
  ];

  return (
    <AdminLayout title="Review Queue">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6" />
              Review Queue
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Approve or reject scholarship submissions from agents and scrapers.
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Pending" value={stats.pending}
              icon={<Clock className="w-5 h-5 text-amber-500" />}
              active={statusFilter === 'pending_review'}
              onClick={() => { setStatusFilter('pending_review'); setPage(1); }}
            />
            <StatCard
              label="Approved" value={stats.approved}
              icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
              active={statusFilter === 'approved'}
              onClick={() => { setStatusFilter('approved'); setPage(1); }}
            />
            <StatCard
              label="Rejected" value={stats.rejected}
              icon={<XCircle className="w-5 h-5 text-red-500" />}
              active={statusFilter === 'rejected'}
              onClick={() => { setStatusFilter('rejected'); setPage(1); }}
            />
            <StatCard
              label="Total" value={stats.total}
              icon={<ClipboardCheck className="w-5 h-5 text-gray-400" />}
              active={statusFilter === ''}
              onClick={() => { setStatusFilter(''); setPage(1); }}
            />
          </div>
        )}

        {/* Table */}
        {error ? (
          <div className="text-red-600 text-sm p-4">Error: {(error as Error).message}</div>
        ) : (
          <DataTable<PendingScholarship>
            columns={columns}
            rows={list?.items ?? []}
            isLoading={isLoading}
            keyExtractor={(row) => row.id}
            onRowClick={(row) => setSelectedId(row.id)}
          />
        )}

        {/* Pagination */}
        {list && list.pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-sm text-text-secondary">Page {page} of {list.pages}</span>
            <Button variant="secondary" onClick={() => setPage((p) => Math.min(list.pages, p + 1))} disabled={page === list.pages}>
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <Drawer
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title="Review Submission"
        widthClass="w-[640px]"
        footer={
          selected && selected.status === 'pending_review' ? (
            <div className="flex items-center justify-between w-full">
              <Button variant="ghost" leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={handleDelete} className="text-red-600 hover:text-red-700">
                Delete
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="secondary" leftIcon={<XCircle className="w-3.5 h-3.5" />}
                  onClick={handleReject}>
                  Reject
                </Button>
                <Button leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                  onClick={handleApprove} loading={approveMutation.isPending}>
                  Approve
                </Button>
              </div>
            </div>
          ) : selected ? (
            <div className="text-sm text-text-secondary">
              This submission has already been {selected.status}.
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-6">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-text-secondary">Submitted by</span>
                <div className="font-medium">{selected.submitted_by}</div>
              </div>
              <div>
                <span className="text-text-secondary">Submitted at</span>
                <div className="font-medium">{fmtDate(selected.created_at)}</div>
              </div>
              <div>
                <span className="text-text-secondary">Status</span>
                <div><Badge tone={statusTone(selected.status)}>{statusLabel(selected.status)}</Badge></div>
              </div>
              {selected.rejection_reason && (
                <div>
                  <span className="text-text-secondary">Rejection reason</span>
                  <div className="text-red-600">{selected.rejection_reason}</div>
                </div>
              )}
            </div>

            {/* Payload Preview */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Submitted Data
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
                <PayloadField label="Name" value={selected.payload?.name} />
                <PayloadField label="Country" value={selected.payload?.host_country} />
                <PayloadField label="Institution" value={selected.payload?.host_institution} />
                <PayloadField label="Provider" value={selected.payload?.provider} />
                <PayloadField label="Funding" value={selected.payload?.funding_type} />
                <PayloadField label="Degree Levels" value={selected.payload?.degree_levels?.join(', ')} />
                <PayloadField label="Fields" value={selected.payload?.fields_of_study?.join(', ')} />
                <PayloadField label="Deadline" value={selected.payload?.deadline} />
                <PayloadField label="Stipend" value={selected.payload?.monthly_stipend_usd ? `$${selected.payload.monthly_stipend_usd}` : null} />
                <PayloadField label="URL" value={selected.payload?.official_url} isLink />
                <PayloadField label="Description" value={selected.payload?.description} />
              </div>
            </div>

            {/* Raw JSON */}
            <details className="text-sm">
              <summary className="cursor-pointer text-text-secondary hover:text-text-primary">Raw JSON payload</summary>
              <pre className="mt-2 bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto text-xs max-h-64">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <div className="text-text-secondary text-sm">Loading...</div>
        )}
      </Drawer>
    </AdminLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function StatCard({
  label, value, icon, active, onClick,
}: {
  label: string; value: number; icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
        active ? 'border-primary bg-primary/5 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}>
      {icon}
      <div className="text-left">
        <div className="text-2xl font-bold text-text-primary">{value}</div>
        <div className="text-xs text-text-secondary">{label}</div>
      </div>
    </button>
  );
}

function PayloadField({ label, value, isLink }: { label: string; value?: string | null; isLink?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-text-secondary shrink-0 w-28">{label}</span>
      {isLink ? (
        <a href={value} target="_blank" rel="noopener noreferrer"
          className="text-primary hover:underline flex items-center gap-1 truncate">
          {value} <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      ) : (
        <span className="text-text-primary break-words">{value}</span>
      )}
    </div>
  );
}
