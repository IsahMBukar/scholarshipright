'use client';

// Admin Country Groups management page.
// List, create, edit, and soft-delete reusable country groups.
// Groups are referenced by scholarships for eligibility rules.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, ChevronDown, ChevronUp, X, Search } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import Button from '@/components/admin/ui/Button';
import Badge, { type BadgeTone } from '@/components/admin/ui/Badge';
import Drawer from '@/components/admin/ui/Drawer';
import { useToast } from '@/components/admin/ui/Toast';
import { useConfirm } from '@/components/admin/ui/ConfirmDialog';
import { adminApi } from '@/lib/admin/api';
import type { AdminCountryGroup, CountryOption, GroupCreateRequest, GroupUpdateRequest } from '@/lib/admin/types';

// ── Helpers ──────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Country Multi-Picker ─────────────────────────────────────────

function CountryPicker({
  selected,
  onChange,
  countries,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
  countries: CountryOption[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const countryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of countries) m.set(c.code, c.name);
    return m;
  }, [countries]);

  const filtered = useMemo(() => {
    if (!search) return countries.slice(0, 50);
    const q = search.toLowerCase();
    return countries
      .filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      .slice(0, 20);
  }, [countries, search]);

  const add = (code: string) => {
    if (!selected.includes(code)) onChange([...selected, code]);
    setSearch('');
  };

  const remove = (code: string) => {
    onChange(selected.filter(c => c !== code));
  };

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(code => (
            <span
              key={code}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full"
            >
              {countryMap.get(code) || code}
              <button type="button" onClick={() => remove(code)} className="hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={`Search countries… (${selected.length} selected)`}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
        />
        {open && search && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No countries found</div>
            ) : (
              filtered.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => add(c.code)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                    selected.includes(c.code) ? 'bg-primary/5 text-primary' : ''
                  }`}
                >
                  <span>{c.name} <span className="text-gray-400">({c.code})</span></span>
                  {selected.includes(c.code) && <span className="text-xs">✓</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-primary hover:underline flex items-center gap-1"
      >
        {open ? 'Hide' : 'Browse'} all countries {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && !search && (
        <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
          {countries.map(c => (
            <button
              key={c.code}
              type="button"
              onClick={() => add(c.code)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${
                selected.includes(c.code) ? 'bg-primary/5 text-primary' : ''
              }`}
            >
              <span>{c.name}</span>
              {selected.includes(c.code) && <span className="text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create/Edit Drawer ───────────────────────────────────────────

function GroupDrawer({
  group,
  countries,
  onClose,
  onSave,
}: {
  group: AdminCountryGroup | null;
  countries: CountryOption[];
  onClose: () => void;
  onSave: (data: GroupCreateRequest | GroupUpdateRequest) => void;
}) {
  const isEdit = !!group;
  const [code, setCode] = useState(group?.code || '');
  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [sourceUrl, setSourceUrl] = useState(group?.source_url || '');
  const [sourceDate, setSourceDate] = useState(group?.source_date || '');
  const [members, setMembers] = useState<string[]>(group?.members.map(m => m.code) || []);
  const [saving, setSaving] = useState(false);

  const canSave = code.trim() && name.trim() && (isEdit || members.length > 0);

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEdit) {
        const trimmedDesc = description.trim();
        const trimmedUrl = sourceUrl.trim();
        await onSave({
          name: name.trim(),
          description: trimmedDesc || undefined,
          source_url: trimmedUrl || undefined,
          source_date: sourceDate || undefined,
          members,
        });
      } else {
        const trimmedDesc = description.trim();
        const trimmedUrl = sourceUrl.trim();
        await onSave({
          code: code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
          name: name.trim(),
          description: trimmedDesc || undefined,
          source_url: trimmedUrl || undefined,
          source_date: sourceDate || undefined,
          members,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title={isEdit ? `Edit: ${group.code}` : 'New Country Group'} widthClass="max-w-2xl">
      <div className="space-y-5 p-5">
        {/* Code */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Code (slug) {isEdit && <span className="font-normal text-gray-400">— cannot be changed</span>}
          </label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
            disabled={isEdit}
            placeholder="e.g. NIIED, EU, COMMONWEALTH"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Display Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. NIIED/GKS-Eligible Countries"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Description <span className="font-normal text-gray-400">(optional, admin-facing)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="What this group represents, notes for other admins…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none"
          />
        </div>

        {/* Source */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Source URL</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              placeholder="https://…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Source Date</label>
            <input
              type="date"
              value={sourceDate}
              onChange={e => setSourceDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
        </div>

        {/* Members */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Member Countries <span className="font-normal text-gray-400">({members.length} selected)</span>
          </label>
          <CountryPicker selected={members} onChange={setMembers} countries={countries} />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Group'}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function AdminGroupsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'deprecated' | ''>('');
  const [editingGroup, setEditingGroup] = useState<AdminCountryGroup | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  // Fetch groups
  const groups = useQuery({
    queryKey: ['admin', 'groups', { search, status: statusFilter }],
    queryFn: () => adminApi.listGroups({
      search: search || undefined,
      status: statusFilter || undefined,
    }),
  });

  // Fetch countries for the picker
  const countries = useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: () => adminApi.listCountries(),
    staleTime: 300_000, // 5 min — countries don't change
  });

  const countryOptions: CountryOption[] = countries.data || [];

  // Create mutation
  const createGroup = useMutation({
    mutationFn: (body: GroupCreateRequest) => adminApi.createGroup(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
      setShowCreate(false);
      toast.success('Group created');
    },
    onError: (err: Error) => {
      toast.error('Failed to create group', err?.message);
    },
  });

  // Update mutation
  const updateGroup = useMutation({
    mutationFn: ({ code, body }: { code: string; body: GroupUpdateRequest }) => adminApi.updateGroup(code, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
      setEditingGroup(null);
      toast.success('Group updated');
    },
    onError: (err: Error) => {
      toast.error('Failed to update group', err?.message);
    },
  });

  // Delete (deprecate) mutation
  const deleteGroup = useMutation({
    mutationFn: (code: string) => adminApi.deleteGroup(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
      toast.success('Group deprecated');
    },
    onError: (err: Error) => {
      toast.error('Failed to deprecate group', err?.message);
    },
  });

  const handleDeprecate = useCallback(
    async (group: AdminCountryGroup) => {
      const ok = await confirm({
        title: `Deprecate "${group.code}"?`,
        description: `This group is used by ${group.scholarship_count} scholarship(s). Existing scholarships will keep their last-resolved country lists but will be flagged for admin review.`,
        confirmLabel: 'Deprecate',
        tone: 'danger',
      });
      if (ok) deleteGroup.mutate(group.code);
    },
    [confirm, deleteGroup]
  );

  const items = groups.data?.items || [];

  return (
    <AdminLayout title="Country Groups">
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Country Groups</h1>
            <p className="text-sm text-text-secondary mt-1">
              Reusable sets of countries for scholarship eligibility rules. Changes trigger automatic re-resolution.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Group
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search groups…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'active' | 'deprecated' | '')}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary outline-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </div>

        {/* Loading */}
        {groups.isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {groups.isError && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
            Failed to load groups. {(groups.error as Error | null)?.message || ''}
          </div>
        )}

        {/* Group list */}
        {!groups.isLoading && !groups.isError && (
          <div className="space-y-3">
            {items.length === 0 && (
              <div className="p-8 text-center text-gray-500 text-sm">
                No groups found. Create one to get started.
              </div>
            )}
            {items.map(group => (
              <div
                key={group.id}
                className={`bg-white border rounded-lg transition-all ${
                  group.status === 'deprecated' ? 'border-gray-200 opacity-60' : 'border-gray-200'
                }`}
              >
                {/* Row */}
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-primary">{group.code}</span>
                      <span className="text-sm text-gray-400">·</span>
                      <span className="text-sm font-medium text-text-primary truncate">{group.name}</span>
                      {group.status === 'deprecated' && (
                        <Badge tone="negative">deprecated</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                      <span>{group.member_count} countries</span>
                      <span>·</span>
                      <span>Used by {group.scholarship_count} scholarship(s)</span>
                      {group.source_url && (
                        <>
                          <span>·</span>
                          <a
                            href={group.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-0.5"
                          >
                            source <ExternalLink className="w-3 h-3" />
                          </a>
                        </>
                      )}
                      {group.source_date && (
                        <>
                          <span>·</span>
                          <span>{fmtDate(group.source_date)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandedCode(expandedCode === group.code ? null : group.code)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                      title="Show members"
                    >
                      {expandedCode === group.code ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    {group.status === 'active' && (
                      <>
                        <button
                          onClick={() => setEditingGroup(group)}
                          className="p-1.5 text-gray-400 hover:text-primary rounded"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeprecate(group)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                          title="Deprecate"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded members */}
                {expandedCode === group.code && (
                  <div className="px-4 pb-3 pt-0 border-t border-gray-100">
                    {group.description && (
                      <p className="text-xs text-gray-500 mb-2 mt-2">{group.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {group.members.map(m => (
                        <span
                          key={m.code}
                          className="px-2 py-0.5 bg-gray-100 text-text-secondary text-xs rounded-full"
                        >
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create drawer */}
      {showCreate && (
        <GroupDrawer
          group={null}
          countries={countryOptions}
          onClose={() => setShowCreate(false)}
          onSave={(data) => createGroup.mutateAsync(data as GroupCreateRequest)}
        />
      )}

      {/* Edit drawer */}
      {editingGroup && (
        <GroupDrawer
          group={editingGroup}
          countries={countryOptions}
          onClose={() => setEditingGroup(null)}
          onSave={(data) => updateGroup.mutateAsync({ code: editingGroup.code, body: data })}
        />
      )}
    </AdminLayout>
  );
}
