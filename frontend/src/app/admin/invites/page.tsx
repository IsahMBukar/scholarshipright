'use client';

// Invites page. List of invites with a "create new invite" form on top.
// - Form: email, role (super_admin | support_staff), optional note.
// - On success, show a banner with the one-time invite URL (copy-to-clipboard).
// - List: DataTable with status badge (pending/accepted/revoked/expired), revoke button.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import { Mail, Plus, Copy, Check, Trash2, AlertTriangle, X } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { type Column } from '@/components/admin/ui/DataTable';
import Badge, { type BadgeTone } from '@/components/admin/ui/Badge';
import Button from '@/components/admin/ui/Button';
import { useToast } from '@/components/admin/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { adminApi, type ListInvitesParams } from '@/lib/admin/api';
import { AdminApiError } from '@/lib/admin/client';
import EmptyState from '@/components/admin/ui/EmptyState';
import type { AdminInviteListEntry, AdminInviteResponse, AdminRole } from '@/lib/admin/types';

type Status = 'pending' | 'accepted' | 'revoked' | 'expired';

function computeStatus(invite: AdminInviteListEntry): Status {
  if (invite.accepted_at) return 'accepted';
  if (invite.revoked_at) return 'revoked';
  if (new Date(invite.expires_at).getTime() < Date.now()) return 'expired';
  return 'pending';
}

const STATUS_TONE: Record<Status, BadgeTone> = {
  pending: 'primary',
  accepted: 'positive',
  revoked: 'neutral',
  expired: 'warning',
};

const ROLE_TONE: Record<AdminRole, BadgeTone> = {
  super_admin: 'negative',
  support_staff: 'info',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminInvitesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [includeAccepted, setIncludeAccepted] = useState(false);
  const [includeRevoked, setIncludeRevoked] = useState(false);

  // Create-invite form state
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('support_staff');
  const [note, setNote] = useState('');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const params: ListInvitesParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      include_accepted: includeAccepted,
      include_revoked: includeRevoked,
    }),
    [page, pageSize, includeAccepted, includeRevoked]
  );

  const invites = useQuery({
    queryKey: ['admin', 'invites', params],
    queryFn: () => adminApi.listInvites(params),
  });

  const createInvite = useMutation({
    mutationFn: (body: Parameters<typeof adminApi.createInvite>[0]) => adminApi.createInvite(body),
    onSuccess: (data: AdminInviteResponse) => {
      qc.invalidateQueries({ queryKey: ['admin', 'invites'] });
      setCreatedUrl(data.invite_url);
      setCopied(false);
      setEmail('');
      setNote('');
      toast.success('Invite created', `Sent to ${data.email}`);
    },
    onError: (err: Error) => {
      const msg = err instanceof AdminApiError ? err.message : 'Create failed';
      toast.error('Failed to create invite', msg);
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => adminApi.revokeInvite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'invites'] });
      toast.success('Invite revoked');
    },
    onError: (err: Error) => {
      const msg = err instanceof AdminApiError ? err.message : 'Revoke failed';
      toast.error('Failed to revoke invite', msg);
    },
  });

  const handleCopy = useCallback(async () => {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Best-effort — user can still select & copy manually.
    }
  }, [createdUrl]);

  const columns: Column<AdminInviteListEntry>[] = useMemo(
    () => [
      {
        key: 'email',
        header: 'Email',
        accessor: (r) => r.email,
        cell: (r) => <span className="font-medium text-text-primary">{r.email}</span>,
      },
      {
        key: 'admin_role',
        header: 'Role',
        accessor: (r) => r.admin_role,
        cell: (r) => (
          <Badge tone={ROLE_TONE[r.admin_role]}>
            {r.admin_role.replace('_', ' ')}
          </Badge>
        ),
        disableFilter: true,
      },
      {
        key: 'status',
        header: 'Status',
        accessor: (r) => computeStatus(r),
        cell: (r) => {
          const s = computeStatus(r);
          return <Badge tone={STATUS_TONE[s]}>{s}</Badge>;
        },
        disableFilter: true,
      },
      {
        key: 'invited_by_email',
        header: 'Invited by',
        accessor: (r) => r.invited_by_email ?? '',
        cell: (r) => (
          <span className="text-text-secondary text-xs">{r.invited_by_email ?? '—'}</span>
        ),
        disableFilter: true,
      },
      {
        key: 'created_at',
        header: 'Created',
        accessor: (r) => r.created_at,
        cell: (r) => <span className="text-text-secondary text-xs">{fmtDate(r.created_at)}</span>,
      },
      {
        key: 'expires_at',
        header: 'Expires',
        accessor: (r) => r.expires_at,
        cell: (r) => <span className="text-text-secondary text-xs">{fmtDate(r.expires_at)}</span>,
        disableFilter: true,
      },
      {
        key: 'actions',
        header: '',
        accessor: () => '',
        disableSort: true,
        disableFilter: true,
        cell: (r) => {
          const status = computeStatus(r);
          if (status !== 'pending') {
            return <span className="text-text-secondary text-xs">—</span>;
          }
          return <RevokeButton invite={r} onRevoke={() => revoke.mutate(r.id)} />;
        },
        align: 'right',
      },
    ],
    [revoke]
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={includeAccepted}
          onChange={(e) => {
            setIncludeAccepted(e.target.checked);
            setPage(1);
          }}
          className="rounded border-gray-300"
        />
        Show accepted
      </label>
      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={includeRevoked}
          onChange={(e) => {
            setIncludeRevoked(e.target.checked);
            setPage(1);
          }}
          className="rounded border-gray-300"
        />
        Show revoked
      </label>
    </div>
  );

  return (
    <AdminLayout
      title="Invites"
      description="Provision new admins"
      actions={headerActions}
    >
      <div className="space-y-4">
        {/* Create form */}
        <div className="bg-white rounded-card border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-text-primary">New invite</h2>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              createInvite.mutate({
                email: email.trim(),
                admin_role: role,
                note: note.trim() || undefined,
              });
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AdminRole)}
                className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="support_staff">Support staff</option>
                <option value="super_admin">Super admin</option>
              </select>
            </div>

            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (max 500 chars)"
              maxLength={500}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
            />

            <div className="flex items-center justify-between gap-3">
              {(createInvite.error as AdminApiError | null)?.message && (
                <div className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {(createInvite.error as AdminApiError).message}
                </div>
              )}
              <div className="flex-1" />
              <Button type="submit" loading={createInvite.isPending} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Create invite
              </Button>
            </div>
          </form>

          {createdUrl && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-md p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-emerald-800">
                  ✓ Invite created. Share this link — it&apos;s shown only once:
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreatedUrl(null);
                    setCopied(false);
                  }}
                  className="text-emerald-700 hover:text-emerald-900"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-white border border-emerald-200 rounded px-2 py-1.5 truncate">
                  {createdUrl}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopy}
                  leftIcon={
                    copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />
                  }
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* List */}
        <DataTable
          rows={invites.data?.items ?? []}
          total={invites.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          columns={columns}
          isLoading={invites.isLoading}
          error={(invites.error as AdminApiError | null)?.message ?? null}
          keyExtractor={(r) => r.id}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          emptyState={
            <EmptyState
              title="No invites yet"
              description="Create your first admin invite using the form above."
              icon={<Mail className="w-6 h-6" />}
            />
          }
        />
      </div>
    </AdminLayout>
  );
}

// ── RevokeButton ───────────────────────────────────────────────────
// Defined outside AdminInvitesPage so it can use the useConfirm() hook
// (column cell renderers are plain functions, not React components, so
// they can't call hooks directly).
function RevokeButton({
  invite,
  onRevoke,
}: {
  invite: AdminInviteListEntry;
  onRevoke: () => void;
}) {
  const confirm = useConfirm();
  return (
    <Button
      variant="danger"
      size="sm"
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await confirm({
          title: 'Revoke invite?',
          description: (
            <>
              <span className="font-mono">{invite.email}</span> won&apos;t be
              able to accept this invite. This can&apos;t be undone.
            </>
          ),
          confirmLabel: 'Revoke invite',
          tone: 'danger',
        });
        if (ok) onRevoke();
      }}
    >
      <Trash2 className="w-3 h-3" />
      Revoke
    </Button>
  );
}
