'use client';

// Users management page. DataTable + side drawer for detail / role change / activate.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import { Calendar, ShieldCheck, ShieldOff } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { type Column, type SortDir } from '@/components/admin/ui/DataTable';
import Badge, { type BadgeTone } from '@/components/admin/ui/Badge';
import Button from '@/components/admin/ui/Button';
import Drawer from '@/components/admin/ui/Drawer';
import { adminApi, type ListUsersParams } from '@/lib/admin/api';
import { AdminApiError } from '@/lib/admin/client';
import type { AdminUser, AdminRole } from '@/lib/admin/types';

const ROLE_TONE: Record<AdminRole, BadgeTone> = {
  super_admin: 'negative',
  admin: 'primary',
  support: 'info',
  viewer: 'neutral',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [adminFilter, setAdminFilter] = useState<'' | 'true' | 'false'>('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const params: ListUsersParams = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: search || undefined,
      sort_by: sortKey ?? undefined,
      sort_dir: sortDir ?? undefined,
      is_active: activeFilter ? activeFilter === 'true' : undefined,
      is_admin: adminFilter ? adminFilter === 'true' : undefined,
    }),
    [page, pageSize, search, sortKey, sortDir, activeFilter, adminFilter]
  );

  const users = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => adminApi.listUsers(params),
  });

  const updateUser = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Parameters<typeof adminApi.updateUser>[1];
    }) => adminApi.updateUser(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });

  const columns: Column<AdminUser>[] = useMemo(
    () => [
      {
        key: 'email',
        header: 'Email',
        accessor: (r) => r.email,
        cell: (r) => (
          <div className="flex flex-col">
            <span className="font-medium text-text-primary">{r.email}</span>
            {r.full_name && (
              <span className="text-xs text-text-secondary">{r.full_name}</span>
            )}
          </div>
        ),
      },
      {
        key: 'is_admin',
        header: 'Role',
        accessor: (r) => (r.is_admin ? r.admin_role ?? 'admin' : 'user'),
        cell: (r) =>
          r.is_admin && r.admin_role ? (
            <Badge tone={ROLE_TONE[r.admin_role]}>{r.admin_role.replace('_', ' ')}</Badge>
          ) : (
            <Badge tone="neutral">user</Badge>
          ),
        disableFilter: true,
      },
      {
        key: 'is_active',
        header: 'Status',
        accessor: (r) => (r.is_active ? 1 : 0),
        cell: (r) =>
          r.is_active ? (
            <Badge tone="positive">active</Badge>
          ) : (
            <Badge tone="negative">disabled</Badge>
          ),
        disableFilter: true,
      },
      {
        key: 'created_at',
        header: 'Joined',
        accessor: (r) => r.created_at,
        cell: (r) => (
          <span className="text-text-secondary text-xs">{fmtDate(r.created_at)}</span>
        ),
      },
      {
        key: 'last_login_at',
        header: 'Last login',
        accessor: (r) => r.last_login_at ?? '',
        cell: (r) => (
          <span className="text-text-secondary text-xs">{fmtDate(r.last_login_at)}</span>
        ),
        disableFilter: true,
      },
      {
        key: 'resume_count',
        header: 'Resumes',
        accessor: (r) => r.resume_count,
        align: 'right',
        disableFilter: true,
      },
      {
        key: 'saved_count',
        header: 'Saved',
        accessor: (r) => r.saved_count,
        align: 'right',
        disableFilter: true,
      },
    ],
    []
  );

  // Top-level toolbar (renders a global search input that overrides the column filter).
  const headerSearch = (
    <input
      type="text"
      value={search}
      onChange={(e) => {
        setSearch(e.target.value);
        setPage(1);
      }}
      placeholder="Search by email or name"
      className="h-9 w-64 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
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
        <option value="false">Disabled</option>
      </select>
      <select
        value={adminFilter}
        onChange={(e) => {
          setAdminFilter(e.target.value as '' | 'true' | 'false');
          setPage(1);
        }}
        className="h-9 px-2 text-sm bg-white border border-gray-200 rounded-btn"
      >
        <option value="">All roles</option>
        <option value="true">Admins only</option>
        <option value="false">Non-admins</option>
      </select>
    </div>
  );

  return (
    <AdminLayout
      title="Users"
      description="Manage user accounts, roles, and access"
      actions={headerActions}
    >
      <div className="space-y-3">
        {headerSearch}
        <DataTable
          rows={users.data?.items ?? []}
          total={users.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          columns={columns}
          isLoading={users.isLoading}
          error={
            (users.error as AdminApiError | null)?.message ?? null
          }
          keyExtractor={(r) => r.id}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          onSortChange={(key, dir) => {
            setSortKey(key);
            setSortDir(dir);
            setPage(1);
          }}
          onRowClick={(r) => setSelectedUser(r)}
          emptyMessage="No users match the current filters."
        />
      </div>

      <UserDrawer
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onSave={async (body) => {
          if (!selectedUser) return;
          await updateUser.mutateAsync({ id: selectedUser.id, body });
          setSelectedUser(null);
        }}
        saving={updateUser.isPending}
        saveError={
          (updateUser.error as AdminApiError | null)?.message ?? null
        }
      />
    </AdminLayout>
  );
}

function UserDrawer({
  user,
  onClose,
  onSave,
  saving,
  saveError,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSave: (body: {
    is_active?: boolean;
    is_admin?: boolean;
    admin_role?: AdminRole | null;
  }) => Promise<void>;
  saving: boolean;
  saveError: string | null;
}) {
  const [role, setRole] = useState<AdminRole | ''>('');
  const [isActive, setIsActive] = useState(true);

  // Sync local state when user changes
  useMemo(() => {
    if (!user) return;
    setRole(user.admin_role ?? '');
    setIsActive(user.is_active);
  }, [user]);

  const handleSave = useCallback(() => {
    if (!user) return;
    onSave({
      is_active: isActive,
      is_admin: role !== '' || user.is_admin,
      admin_role: role === '' ? null : role,
    });
  }, [user, isActive, role, onSave]);

  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      title={user ? user.email : ''}
      footer={
        user ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save changes
            </Button>
          </div>
        ) : null
      }
    >
      {user && (
        <div className="space-y-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-secondary mb-1">
              Account
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 text-text-primary">
                <Calendar className="w-3.5 h-3.5 text-text-secondary" />
                <span>Joined {fmtDate(user.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-text-primary">
                <Calendar className="w-3.5 h-3.5 text-text-secondary" />
                <span>Last login {fmtDate(user.last_login_at)}</span>
              </div>
              <div className="text-text-secondary text-xs pt-1">
                {user.resume_count} resumes · {user.saved_count} saved
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-text-secondary mb-2">
              Status
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>Active account</span>
            </label>
            <p className="text-xs text-text-secondary mt-1 ml-6">
              Disabling prevents login but keeps historical data.
            </p>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-text-secondary mb-2">
              Admin role
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole | '')}
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Not an admin</option>
              <option value="viewer">Viewer (read-only)</option>
              <option value="support">Support (audit, no destructive)</option>
              <option value="admin">Admin (full except invites)</option>
              <option value="super_admin">Super Admin (everything)</option>
            </select>
            <p className="text-xs text-text-secondary mt-1">
              {role === 'super_admin' && (
                <span className="inline-flex items-center gap-1 text-red-600">
                  <ShieldCheck className="w-3 h-3" /> Full destructive access.
                </span>
              )}
              {role === 'admin' && 'Full access except creating invites.'}
              {role === 'support' && 'Read access to users and audit. Cannot delete or invite.'}
              {role === 'viewer' && 'Read-only across all admin pages.'}
              {role === '' && (
                <span className="inline-flex items-center gap-1">
                  <ShieldOff className="w-3 h-3" /> Regular user, no admin access.
                </span>
              )}
            </p>
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
