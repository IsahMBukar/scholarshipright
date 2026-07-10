'use client';

// Scholarships admin page.
// - DataTable over /api/admin/scholarships (paginated, sortable, filterable).
// - Top search + active/verified/funding filters.
// - Primary CTA: "+ New scholarship" → CreateScholarshipWizard (full form).
// - Click row → ScholarshipDrawer (Edit) with all 34 fields, save → PATCH.
// - Bulk-activate / bulk-deactivate via the DataTable toolbar.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Calendar, Globe, CheckCircle2, XCircle, ExternalLink, RotateCw, Plus, AlertTriangle, Upload } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { type Column } from '@/components/admin/ui/DataTable';
import Badge, { type BadgeTone } from '@/components/admin/ui/Badge';
import Button from '@/components/admin/ui/Button';
import Drawer from '@/components/admin/ui/Drawer';
import { useToast } from '@/components/admin/ui/Toast';
import CreateScholarshipWizard from '@/components/admin/CreateScholarshipWizard';
import BulkImportDrawer from '@/components/admin/BulkImportDrawer';
import {
  FUNDING_OPTIONS as FORM_FUNDING_OPTIONS,
  ENGLISH_TEST_OPTIONS,
  DEGREE_LEVEL_OPTIONS,
  FIELD_OF_STUDY_OPTIONS,
  COUNTRY_OPTIONS,
  formFromScholarship,
  emptyForm,
  validateForm,
  buildPatchBody,
  type ScholarshipForm,
} from '@/components/admin/scholarshipForm';
import {
  FieldLabel,
  TextInput,
  TextArea,
  SectionHeader,
  CheckboxRow,
} from '@/components/admin/FormPrimitives';
import MultiSelect from '@/components/admin/ui/MultiSelect';
import { adminApi, type ListScholarshipsParams } from '@/lib/admin/api';
import type { AdminScholarshipCreate, AdminScholarshipPatch } from '@/lib/admin/types';
import { AdminApiError } from '@/lib/admin/client';
import SearchInput from '@/components/admin/ui/SearchInput';
import type { AdminScholarship } from '@/lib/admin/types';
import UnifiedDocumentsEditor from '@/components/admin/UnifiedDocumentsEditor';
import EligibilityBuilder from '@/components/admin/EligibilityBuilder';

// Page-level filter values for the funding_type dropdown above the table.
// Note: these are the values admins can FILTER by, not the values in the
// canonical form dropdown. Kept separate from FORM_FUNDING_OPTIONS (the
// shared one in scholarshipForm.ts) because the filter UI is a separate
// concern — admins searching for "partially_funded" should still find
// rows even if the create/edit form doesn't expose that exact label.
const PAGE_FUNDING_OPTIONS = [
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
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

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

  const create = useMutation({
    mutationFn: (body: AdminScholarshipCreate) => adminApi.createScholarship(body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['admin', 'scholarships'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
      toast.success('Scholarship created', data.name);
      setCreateOpen(false);
    },
    onError: (err: Error) => {
      const msg = err instanceof AdminApiError ? err.message : 'Create failed';
      // eslint-disable-next-line no-console
      console.error('create scholarship failed:', msg);
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
      <Button
        variant="primary"
        size="md"
        onClick={() => setCreateOpen(true)}
        leftIcon={<Plus className="w-3.5 h-3.5" />}
      >
        New scholarship
      </Button>
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
        {PAGE_FUNDING_OPTIONS.map((f) => (
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

      <CreateScholarshipWizard
        open={createOpen}
        onClose={() => {
          if (!create.isPending) setCreateOpen(false);
        }}
        onCreate={async (body) => {
          await create.mutateAsync(body);
        }}
        saving={create.isPending}
        saveError={
          create.error instanceof AdminApiError
            ? create.error.message
            : create.error
            ? 'Create failed — see console for details.'
            : null
        }
      />
      <BulkImportDrawer
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
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
  onSave: (body: AdminScholarshipPatch) => Promise<void>;
  saving: boolean;
  saveError: string | null;
}) {
  // Single source of truth for all 34 editable fields. We seed from
  // emptyForm() (not `{}`) so array fields like accepted_english_tests are
  // always defined — otherwise the very first render after the parent sets
  // `scholarship` would see form.accepted_english_tests === undefined and
  // crash, since useState's lazy initializer only runs on mount and the
  // useEffect below only runs AFTER that render.
  const [form, setForm] = useState<ScholarshipForm>(() =>
    scholarship ? formFromScholarship(scholarship) : emptyForm()
  );

  // Re-populate whenever a different row is opened. The id is the right
  // dependency — switching rows would otherwise keep the previous form
  // until the user typed something.
  useEffect(() => {
    if (scholarship) {
      setForm(formFromScholarship(scholarship));
    }
  }, [scholarship?.id, scholarship]);

  // Generic setter — type-safe, mirrors the Create drawer pattern.
  const set = useCallback(
    <K extends keyof ScholarshipForm>(key: K, value: ScholarshipForm[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(() => {
    if (!scholarship) return;
    // buildPatchBody is diff-based: only changed fields hit the wire.
    onSave(buildPatchBody(form, scholarship));
  }, [form, scholarship, onSave]);

  const toggleTest = useCallback(
    (test: string, checked: boolean) => {
      setForm((f) => {
        const has = f.accepted_english_tests.includes(test);
        if (checked && !has) {
          return { ...f, accepted_english_tests: [...(f.accepted_english_tests ?? []), test] };
        }
        if (!checked && has) {
          return {
            ...f,
            accepted_english_tests: (f.accepted_english_tests ?? []).filter((t) => t !== test),
          };
        }
        return f;
      });
    },
    []
  );

  return (
    <Drawer
      open={!!scholarship}
      onClose={onClose}
      title={scholarship ? 'Edit scholarship' : ''}
      widthClass="w-[640px]"
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
        <div className="space-y-1">
          {/* ── Identity ─────────────────────────────────────── */}
          <SectionHeader hint="Required by backend (PATCH keeps them required).">
            Identity
          </SectionHeader>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <FieldLabel required>Name</FieldLabel>
              <TextInput
                value={form.name}
                onChange={(v) => set('name', v)}
                placeholder="Chevening Scholarship"
              />
            </div>
            <div>
              <FieldLabel>Slug</FieldLabel>
              <TextInput value={form.slug} onChange={() => {}} className="opacity-60 cursor-not-allowed" />
              <p className="text-[10px] text-text-secondary mt-1">
                Slug is read-only here — changing it would break public links and match scores.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Host country</FieldLabel>
                <MultiSelect
                  multiple={false}
                  value={form.host_country || null}
                  onChange={(v) => set('host_country', v ?? '')}
                  options={COUNTRY_OPTIONS}
                  placeholder="Pick a country — type to search…"
                  ariaLabel="Host country"
                  id="edit-host-country"
                />
              </div>
              <div>
                <FieldLabel>Host institution</FieldLabel>
                <TextInput
                  value={form.host_institution}
                  onChange={(v) => set('host_institution', v)}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Provider</FieldLabel>
              <TextInput
                value={form.provider}
                onChange={(v) => set('provider', v)}
                placeholder="e.g. Chevening, DAAD, Fulbright"
              />
            </div>
          </div>

          {/* ── Scope ────────────────────────────────────────── */}
          <SectionHeader hint="Pick from the canonical lists. Free text is allowed for values not in the list.">
            Scope
          </SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Degree levels</FieldLabel>
              <MultiSelect
                multiple
                value={form.degree_levels}
                onChange={(v) => set('degree_levels', v)}
                options={DEGREE_LEVEL_OPTIONS}
                placeholder="Pick degree levels…"
                ariaLabel="Degree levels"
                id="edit-degree-levels"
              />
            </div>
            <div>
              <FieldLabel>Fields of study</FieldLabel>
              <MultiSelect
                multiple
                value={form.fields_of_study}
                onChange={(v) => set('fields_of_study', v)}
                options={FIELD_OF_STUDY_OPTIONS}
                placeholder="Pick fields of study — type to search…"
                ariaLabel="Fields of study"
                id="edit-fields-of-study"
              />
            </div>
            <div>
              <FieldLabel hint="Compose include/exclude rules — groups, countries, or both">
                Eligible countries
              </FieldLabel>
              <EligibilityBuilder
                includedGroups={form.included_groups}
                includedCountries={form.included_countries}
                excludedGroups={form.excluded_groups}
                excludedCountries={form.excluded_countries}
                basis={form.eligibility_basis}
                onChange={(val) => {
                  set('included_groups', val.included_groups);
                  set('included_countries', val.included_countries);
                  set('excluded_groups', val.excluded_groups);
                  set('excluded_countries', val.excluded_countries);
                  set('eligibility_basis', val.eligibility_basis);
                }}
              />
            </div>
          </div>

          {/* ── Funding ──────────────────────────────────────── */}
          <SectionHeader>Funding</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Funding type</FieldLabel>
              <select
                value={form.funding_type}
                onChange={(e) => set('funding_type', e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {FORM_FUNDING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel hint="USD / month">Monthly stipend</FieldLabel>
              <TextInput
                value={form.monthly_stipend_usd}
                onChange={(v) => set('monthly_stipend_usd', v)}
                type="number"
                placeholder="1200"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2">
            <CheckboxRow
              label="Covers tuition"
              checked={form.covers_tuition}
              onChange={(v) => set('covers_tuition', v)}
            />
            <CheckboxRow
              label="Covers living"
              checked={form.covers_living}
              onChange={(v) => set('covers_living', v)}
            />
            <CheckboxRow
              label="Covers flight"
              checked={form.covers_flight}
              onChange={(v) => set('covers_flight', v)}
            />
            <CheckboxRow
              label="Covers health insurance"
              checked={form.covers_health}
              onChange={(v) => set('covers_health', v)}
            />
          </div>

          {/* ── Requirements ─────────────────────────────────── */}
          <SectionHeader hint="Used by the match engine and shown as pills on the detail page.">
            Requirements
          </SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Min CGPA</FieldLabel>
              <TextInput
                value={form.min_cgpa}
                onChange={(v) => set('min_cgpa', v)}
                placeholder="3.5"
              />
            </div>
            <div>
              <FieldLabel>Language of instruction</FieldLabel>
              <TextInput
                value={form.language_of_instruction}
                onChange={(v) => set('language_of_instruction', v)}
                placeholder="English"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3">
            <CheckboxRow
              label="Requires IELTS"
              checked={form.requires_ielts}
              onChange={(v) => set('requires_ielts', v)}
            />
            <div>
              <FieldLabel>Min IELTS score</FieldLabel>
              <TextInput
                value={form.min_ielts_score}
                onChange={(v) => set('min_ielts_score', v)}
                placeholder="6.5"
              />
            </div>
            <CheckboxRow
              label="Requires GRE"
              checked={form.requires_gre}
              onChange={(v) => set('requires_gre', v)}
            />
            <CheckboxRow
              label="Application fee"
              checked={form.requires_application_fee}
              onChange={(v) => set('requires_application_fee', v)}
            />
          </div>

          <div className="pt-3 mt-3 border-t border-gray-100">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-text-secondary">
                Accepted English tests
              </span>
              <span className="text-[10px] text-text-secondary opacity-70">
                shown as pills on the detail page
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {ENGLISH_TEST_OPTIONS.map((opt) => {
                const checked = (form.accepted_english_tests ?? []).includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 text-sm cursor-pointer py-1"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleTest(opt.value, e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
            {form.accepted_english_tests.length === 0 && (
              <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                None selected — the detail page will hide the section.
              </p>
            )}
          </div>

          {/* ── Required Documents (unified) ─────────────────── */}
          {scholarship && (
            <UnifiedDocumentsEditor
              degreeLevels={scholarship.degree_levels || []}
              scholarshipId={scholarship.id}
              initialDegreeDocs={(scholarship as any).degree_documents}
              initialCustomDocs={(scholarship as any).custom_documents}
            />
          )}

          {/* ── Dates ────────────────────────────────────────── */}
          <SectionHeader>Dates</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Open date</FieldLabel>
              <TextInput
                value={form.open_date}
                onChange={(v) => set('open_date', v)}
                type="date"
              />
            </div>
            <div>
              <FieldLabel required>Deadline</FieldLabel>
              <TextInput
                value={form.deadline}
                onChange={(v) => set('deadline', v)}
                type="date"
              />
            </div>
            <div>
              <FieldLabel>Program start date</FieldLabel>
              <TextInput
                value={form.program_start_date}
                onChange={(v) => set('program_start_date', v)}
                type="date"
              />
            </div>
            <div>
              <FieldLabel hint="months">Duration</FieldLabel>
              <TextInput
                value={form.duration_months}
                onChange={(v) => set('duration_months', v)}
                type="number"
                placeholder="12"
              />
            </div>
          </div>

          {/* ── Content ──────────────────────────────────────── */}
          <SectionHeader>Content</SectionHeader>
          <div>
            <FieldLabel required>Official URL</FieldLabel>
            <TextInput
              value={form.official_url}
              onChange={(v) => set('official_url', v)}
              placeholder="https://…"
            />
          </div>
          <div className="mt-3">
            <FieldLabel>Description</FieldLabel>
            <TextArea
              value={form.description}
              onChange={(v) => set('description', v)}
              rows={4}
            />
          </div>
          <div className="mt-3">
            <FieldLabel>Benefits summary</FieldLabel>
            <TextArea
              value={form.benefits_summary}
              onChange={(v) => set('benefits_summary', v)}
              rows={3}
            />
          </div>
          <div className="mt-3">
            <FieldLabel>How to apply</FieldLabel>
            <TextArea
              value={form.how_to_apply}
              onChange={(v) => set('how_to_apply', v)}
              rows={3}
            />
          </div>
          <div className="mt-3">
            <FieldLabel>Logo URL</FieldLabel>
            <TextInput
              value={form.logo_url}
              onChange={(v) => set('logo_url', v)}
              placeholder="https://…"
            />
          </div>

          {/* ── Status ───────────────────────────────────────── */}
          <SectionHeader>Status</SectionHeader>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <CheckboxRow
              label="Active (visible to users)"
              checked={form.is_active}
              onChange={(v) => set('is_active', v)}
            />
            <CheckboxRow
              label="Verified"
              checked={form.is_verified}
              onChange={(v) => set('is_verified', v)}
            />
          </div>
          <div className="mt-3">
            <FieldLabel>Source</FieldLabel>
            <TextInput
              value={form.source}
              onChange={(v) => set('source', v)}
              placeholder="admin_panel, seed, external"
            />
          </div>

          {/* ── Read-only counters (set by the platform) ──────── */}
          <div className="text-xs text-text-secondary pt-4 mt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-y-1">
              <span>Views:</span>
              <span className="font-mono">{scholarship.view_count.toLocaleString()}</span>
              <span>Applications:</span>
              <span className="font-mono">{scholarship.application_count.toLocaleString()}</span>
            </div>
            <p className="mt-2 text-[10px] text-text-secondary/70">
              These are platform counters — not editable here.
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
