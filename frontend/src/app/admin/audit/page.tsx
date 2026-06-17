'use client';

// Audit log page. Read-only DataTable over /api/admin/audit.
// - Filter by action, target_type, actor (admin email).
// - Click row → drawer with full payload JSON pretty-printed.
// - Polling toggle (refresh every 10s) so admins can watch live activity.

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { ScrollText, User, Target, FileJson, RefreshCw, Pause, Play } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { type Column } from '@/components/admin/ui/DataTable';
import Badge, { type BadgeTone } from '@/components/admin/ui/Badge';
import Button from '@/components/admin/ui/Button';
import Drawer from '@/components/admin/ui/Drawer';
import { adminApi, type ListAuditParams } from '@/lib/admin/api';
import { AdminApiError } from '@/lib/admin/client';
import type { AdminAuditEntry } from '@/lib/admin/types';

// Common actions we highlight. Unknown actions fall back to "neutral".
const ACTION_TONE: Record<string, BadgeTone> = {
  'user.update': 'info',
  'user.deactivate': 'warning',
  'user.activate': 'positive',
  'user.role_change': 'warning',
  'scholarship.update': 'info',
  'scholarship.activate': 'positive',
  'scholarship.deactivate': 'warning',
  'scholarship.delete': 'negative',
  'invite.create': 'primary',
  'invite.revoke': 'warning',
  'admin.login': 'positive',
  'admin.logout': 'neutral',
};

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [selected, setSelected] = useState<AdminAuditEntry | null>(null);
  const [polling, setPolling] = useState(false);

  const params: ListAuditParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      action: actionFilter || undefined,
      target_type: targetTypeFilter || undefined,
    }),
    [page, pageSize, actionFilter, targetTypeFilter]
  );

  const audit = useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => adminApi.listAudit(params),
    refetchInterval: polling ? 10_000 : false,
  });

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [actionFilter, targetTypeFilter, pageSize]);

  // Client-side filter on actor email (backend doesn't expose this; do it here
  // for fast typing in the toolbar — backend already narrowed by other filters).
  const filteredItems = useMemo(() => {
    const items = audit.data?.items ?? [];
    if (!actorFilter.trim()) return items;
    const q = actorFilter.toLowerCase();
    return items.filter((i) => (i.admin_email ?? '').toLowerCase().includes(q));
  }, [audit.data, actorFilter]);

  const columns: Column<AdminAuditEntry>[] = useMemo(
    () => [
      {
        key: 'created_at',
        header: 'When',
        accessor: (r) => r.created_at,
        cell: (r) => (
          <span className="text-text-secondary text-xs tabular-nums">
            {fmtTimestamp(r.created_at)}
          </span>
        ),
        disableFilter: true,
      },
      {
        key: 'admin_email',
        header: 'Actor',
        accessor: (r) => r.admin_email ?? '',
        cell: (r) => (
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-text-secondary" />
            <span className="text-text-primary">{r.admin_email ?? '—'}</span>
          </div>
        ),
      },
      {
        key: 'action',
        header: 'Action',
        accessor: (r) => r.action,
        cell: (r) => (
          <Badge tone={ACTION_TONE[r.action] ?? 'neutral'}>{r.action}</Badge>
        ),
      },
      {
        key: 'target_type',
        header: 'Target',
        accessor: (r) => r.target_type,
        cell: (r) => (
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-text-secondary" />
            <span className="text-text-secondary">{r.target_type}</span>
            {r.target_id && (
              <span className="text-xs text-text-secondary font-mono truncate max-w-[140px]">
                {r.target_id}
              </span>
            )}
          </div>
        ),
      },
    ],
    []
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={actorFilter}
        onChange={(e) => setActorFilter(e.target.value)}
        placeholder="Filter by actor email"
        className="h-9 w-56 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <input
        type="text"
        value={actionFilter}
        onChange={(e) => setActionFilter(e.target.value)}
        placeholder="action (e.g. user.update)"
        className="h-9 w-56 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <input
        type="text"
        value={targetTypeFilter}
        onChange={(e) => setTargetTypeFilter(e.target.value)}
        placeholder="target_type (e.g. user)"
        className="h-9 w-48 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <Button
        variant="secondary"
        onClick={() => audit.refetch()}
        title="Refresh now"
        aria-label="Refresh audit log"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant={polling ? 'primary' : 'secondary'}
        onClick={() => setPolling((p) => !p)}
        title={polling ? 'Pause auto-refresh' : 'Resume auto-refresh (10s)'}
      >
        {polling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        {polling ? 'Live' : 'Off'}
      </Button>
    </div>
  );

  return (
    <AdminLayout
      title="Audit log"
      description="Every privileged action, every actor"
      actions={headerActions}
    >
      <DataTable
        rows={filteredItems}
        total={audit.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        columns={columns}
        isLoading={audit.isLoading}
        error={(audit.error as AdminApiError | null)?.message ?? null}
        keyExtractor={(r) => r.id}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onRowClick={(r) => setSelected(r)}
        emptyMessage="No audit entries match the current filters."
      />

      <AuditDrawer entry={selected} onClose={() => setSelected(null)} />
    </AdminLayout>
  );
}

function AuditDrawer({
  entry,
  onClose,
}: {
  entry: AdminAuditEntry | null;
  onClose: () => void;
}) {
  const payloadJson = useMemo(() => {
    if (!entry?.payload) return null;
    try {
      return JSON.stringify(entry.payload, null, 2);
    } catch {
      return String(entry.payload);
    }
  }, [entry]);

  return (
    <Drawer
      open={!!entry}
      onClose={onClose}
      title={entry ? 'Audit entry' : ''}
      widthClass="w-[600px]"
    >
      {entry && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-text-secondary">When</div>
              <div className="mt-0.5 font-mono text-xs">{fmtTimestamp(entry.created_at)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-text-secondary">Entry ID</div>
              <div className="mt-0.5 font-mono text-xs truncate">{entry.id}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-text-secondary">Actor</div>
              <div className="mt-0.5">{entry.admin_email ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-text-secondary">Admin ID</div>
              <div className="mt-0.5 font-mono text-xs truncate">{entry.admin_id ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-text-secondary">Action</div>
              <div className="mt-0.1">
                <Badge tone={ACTION_TONE[entry.action] ?? 'neutral'}>{entry.action}</Badge>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-text-secondary">Target</div>
              <div className="mt-0.5 font-mono text-xs">
                {entry.target_type}
                {entry.target_id && <span className="text-text-secondary"> / {entry.target_id}</span>}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-secondary mb-1">
              <FileJson className="w-3.5 h-3.5" />
              Payload
            </div>
            {payloadJson ? (
              <pre className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                {payloadJson}
              </pre>
            ) : (
              <div className="text-sm text-text-secondary italic">No payload recorded.</div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
