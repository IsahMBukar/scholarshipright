'use client';

// Create-scholarship drawer.
//
// Slides in from the right (consistent with the edit drawer in
// /admin/scholarships/page.tsx). Wider — 640px — to fit all 30 fields in
// 6 logical sections without horizontal scroll.
//
// Section breakdown:
//   1. Identity      — name*, slug*, host_country*, host_institution, provider
//   2. Scope         — degree_levels, fields_of_study, eligible_nationalities,
//                      eligible_regions   (all comma-separated chip inputs)
//   3. Funding       — funding_type*, covers_*, monthly_stipend_usd
//   4. Requirements  — requires_ielts, min_ielts_score, requires_gre,
//                      requires_application_fee, min_cgpa, language_of_instruction
//   5. Dates         — open_date, deadline*, program_start_date, duration_months
//   6. Content       — official_url*, description, benefits_summary,
//                      how_to_apply, logo_url
//   7. Status        — is_active (default true), is_verified, source
//
// * = required by the backend (AdminScholarshipCreate schema)
//
// Required fields are marked with a red asterisk. Slug auto-fills from
// name as you type (until you manually edit it). Date fields use the
// native <input type="date"> picker.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, AlertTriangle, Info, ExternalLink, Link2 } from 'lucide-react';
import Drawer from './ui/Drawer';
import Button from './ui/Button';
import type { AdminScholarshipCreate } from '@/lib/admin/types';

// Funding options shown in the dropdown. Backend accepts any string, but
// the canonical set (matching the seed file) is:
const FUNDING_OPTIONS = [
  { value: 'fully_funded', label: 'Fully funded' },
  { value: 'partial', label: 'Partial funding' },
  { value: 'stipend_only', label: 'Stipend only' },
];

const DEFAULT_LANGUAGE = 'English';
const DEFAULT_ACTIVE = true;

// Auto-derive a slug from a name. Lowercase, dashes for spaces, strip
// non-URL-safe characters.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

// Parse a comma-separated string into a trimmed, non-empty list. Used for
// all the array fields (degree_levels, fields_of_study, etc.).
function parseList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Empty-form factory. Keeps the field set explicit and easy to scan.
function emptyForm(): {
  // Identity
  name: string;
  slug: string;
  slugDirty: boolean; // user has manually edited slug → stop auto-filling
  host_country: string;
  host_institution: string;
  provider: string;
  // Scope
  degree_levels: string;
  fields_of_study: string;
  eligible_nationalities: string;
  eligible_regions: string;
  // Funding
  funding_type: string;
  covers_tuition: boolean;
  covers_living: boolean;
  covers_flight: boolean;
  covers_health: boolean;
  monthly_stipend_usd: string; // string so we can detect empty
  // Requirements
  requires_ielts: boolean;
  min_ielts_score: string;
  requires_gre: boolean;
  requires_application_fee: boolean;
  min_cgpa: string;
  language_of_instruction: string;
  // Dates
  open_date: string;
  deadline: string;
  program_start_date: string;
  duration_months: string;
  // Content
  official_url: string;
  description: string;
  benefits_summary: string;
  how_to_apply: string;
  logo_url: string;
  // Status
  is_active: boolean;
  is_verified: boolean;
  source: string;
} {
  return {
    name: '',
    slug: '',
    slugDirty: false,
    host_country: '',
    host_institution: '',
    provider: '',
    degree_levels: '',
    fields_of_study: '',
    eligible_nationalities: '',
    eligible_regions: '',
    funding_type: 'fully_funded',
    covers_tuition: true,
    covers_living: false,
    covers_flight: false,
    covers_health: false,
    monthly_stipend_usd: '',
    requires_ielts: true,
    min_ielts_score: '',
    requires_gre: false,
    requires_application_fee: false,
    min_cgpa: '',
    language_of_instruction: DEFAULT_LANGUAGE,
    open_date: '',
    deadline: '',
    program_start_date: '',
    duration_months: '',
    official_url: '',
    description: '',
    benefits_summary: '',
    how_to_apply: '',
    logo_url: '',
    is_active: DEFAULT_ACTIVE,
    is_verified: false,
    source: 'admin_panel',
  };
}

// Client-side validation. Returns the first error message, or null.
function validate(form: ReturnType<typeof emptyForm>): string | null {
  if (!form.name.trim()) return 'Name is required.';
  if (!form.slug.trim()) return 'Slug is required.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug))
    return 'Slug must be lowercase letters, digits, and dashes only (e.g. "daad-development").';
  if (!form.host_country.trim()) return 'Host country is required.';
  if (!form.funding_type) return 'Funding type is required.';
  if (!form.deadline) return 'Deadline is required.';
  if (!form.official_url.trim()) return 'Official URL is required.';
  if (!/^https?:\/\//i.test(form.official_url))
    return 'Official URL must start with http:// or https://.';
  if (form.monthly_stipend_usd && Number.isNaN(Number(form.monthly_stipend_usd)))
    return 'Monthly stipend must be a number.';
  if (form.min_ielts_score && Number.isNaN(Number(form.min_ielts_score)))
    return 'Min IELTS score must be a number.';
  if (form.min_cgpa && Number.isNaN(Number(form.min_cgpa)))
    return 'Min CGPA must be a number.';
  if (form.duration_months && Number.isNaN(Number(form.duration_months)))
    return 'Duration must be a number of months.';
  return null;
}

// Build the POST body from the form state, omitting empty optional fields
// so the backend's Pydantic schema treats them as "not set" rather than "".
function buildBody(form: ReturnType<typeof emptyForm>): AdminScholarshipCreate {
  const body: AdminScholarshipCreate = {
    name: form.name.trim(),
    slug: form.slug.trim(),
    host_country: form.host_country.trim(),
    funding_type: form.funding_type,
    deadline: form.deadline,
    official_url: form.official_url.trim(),
  };
  const opt = (v: string) => v.trim() || undefined;
  const optNum = (v: string) => (v.trim() ? Number(v) : undefined);

  const host_institution = opt(form.host_institution);
  if (host_institution) body.host_institution = host_institution;
  const provider = opt(form.provider);
  if (provider) body.provider = provider;
  const degree_levels = parseList(form.degree_levels);
  if (degree_levels.length) body.degree_levels = degree_levels;
  const fields_of_study = parseList(form.fields_of_study);
  if (fields_of_study.length) body.fields_of_study = fields_of_study;
  const eligible_nationalities = parseList(form.eligible_nationalities);
  if (eligible_nationalities.length)
    body.eligible_nationalities = eligible_nationalities;
  const eligible_regions = parseList(form.eligible_regions);
  if (eligible_regions.length) body.eligible_regions = eligible_regions;

  body.covers_tuition = form.covers_tuition;
  body.covers_living = form.covers_living;
  body.covers_flight = form.covers_flight;
  body.covers_health = form.covers_health;
  const stipend = optNum(form.monthly_stipend_usd);
  if (stipend !== undefined) body.monthly_stipend_usd = stipend;

  body.requires_ielts = form.requires_ielts;
  const min_ielts = optNum(form.min_ielts_score);
  if (min_ielts !== undefined) body.min_ielts_score = min_ielts;
  body.requires_gre = form.requires_gre;
  body.requires_application_fee = form.requires_application_fee;
  const min_cgpa = optNum(form.min_cgpa);
  if (min_cgpa !== undefined) body.min_cgpa = min_cgpa;
  if (form.language_of_instruction)
    body.language_of_instruction = form.language_of_instruction;

  const open_date = opt(form.open_date);
  if (open_date) body.open_date = open_date;
  const program_start_date = opt(form.program_start_date);
  if (program_start_date) body.program_start_date = program_start_date;
  const duration_months = optNum(form.duration_months);
  if (duration_months !== undefined) body.duration_months = duration_months;

  const description = opt(form.description);
  if (description) body.description = description;
  const benefits_summary = opt(form.benefits_summary);
  if (benefits_summary) body.benefits_summary = benefits_summary;
  const how_to_apply = opt(form.how_to_apply);
  if (how_to_apply) body.how_to_apply = how_to_apply;
  const logo_url = opt(form.logo_url);
  if (logo_url) body.logo_url = logo_url;

  body.is_active = form.is_active;
  body.is_verified = form.is_verified;
  const source = opt(form.source);
  if (source) body.source = source;

  return body;
}

// ── Reusable input primitives ─────────────────────────────────────

function FieldLabel({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-1">
      <label className="text-xs uppercase tracking-wide text-text-secondary">
        {children}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {hint && (
        <span className="text-[10px] text-text-secondary opacity-70">{hint}</span>
      )}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'date' | 'number' | 'url';
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        'w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn ' +
        'focus:outline-none focus:ring-1 focus:ring-primary ' +
        (className ?? '')
      }
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary resize-y"
    />
  );
}

function SectionHeader({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="pt-4 mt-2 border-t border-gray-200 first:pt-0 first:mt-0 first:border-t-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-3">
        {children}
      </h3>
      {hint && <p className="text-[11px] text-text-secondary -mt-2 mb-3">{hint}</p>}
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
      />
      <span>
        {label}
        {description && (
          <span className="block text-[11px] text-text-secondary">{description}</span>
        )}
      </span>
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────

export interface CreateScholarshipDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreate: (body: AdminScholarshipCreate) => Promise<void>;
  saving: boolean;
  saveError: string | null;
  // Optional: suggest a slug prefix from the admin (e.g. "e2e-test-" for
  // tests, or a name auto-fill). If supplied, applied on open.
  initialName?: string;
  initialSlugPrefix?: string;
}

export default function CreateScholarshipDrawer({
  open,
  onClose,
  onCreate,
  saving,
  saveError,
  initialName,
  initialSlugPrefix,
}: CreateScholarshipDrawerProps) {
  const [form, setForm] = useState(emptyForm);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset form when the drawer opens. Pre-fill optional name/slug for
  // test ergonomics (and for any future "duplicate" flow).
  useEffect(() => {
    if (open) {
      const next = emptyForm();
      if (initialName) next.name = initialName;
      if (initialSlugPrefix && initialName) {
        next.slug = `${initialSlugPrefix}${slugify(initialName)}`;
        next.slugDirty = true;
      }
      setForm(next);
      setValidationError(null);
    }
  }, [open, initialName, initialSlugPrefix]);

  // Auto-fill slug from name (until user manually edits slug).
  const setName = useCallback((name: string) => {
    setForm((f) => ({
      ...f,
      name,
      slug: f.slugDirty ? f.slug : slugify(name),
    }));
  }, []);
  const setSlug = useCallback((slug: string) => {
    setForm((f) => ({ ...f, slug, slugDirty: true }));
  }, []);

  const set = useCallback(
    <K extends keyof ReturnType<typeof emptyForm>>(
      key: K,
      value: ReturnType<typeof emptyForm>[K]
    ) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    const err = validate(form);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    try {
      await onCreate(buildBody(form));
    } catch {
      // onCreate throws on failure; parent sets saveError. We don't
      // need to do anything here — the error renders in the footer.
    }
  }, [form, onCreate]);

  const displayError = validationError || saveError;

  // Slug preview URL: /scholarships/<slug>
  const slugPreview = useMemo(
    () => (form.slug ? `/scholarships/${form.slug}` : null),
    [form.slug]
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New scholarship"
      widthClass="w-[640px]"
      footer={
        <div className="flex items-center justify-between gap-2">
          {displayError ? (
            <div className="flex items-start gap-1.5 text-sm text-red-600 min-w-0 flex-1">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="break-words">{displayError}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-text-secondary min-w-0 flex-1">
              <Info className="w-3 h-3 shrink-0" />
              <span>Fields marked * are required.</span>
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Create scholarship
            </Button>
          </div>
        </div>
      }
    >
      {/* ── Identity ───────────────────────────────────────────── */}
      <SectionHeader>Identity</SectionHeader>
      <div className="space-y-3">
        <div>
          <FieldLabel required>Name</FieldLabel>
          <TextInput
            value={form.name}
            onChange={setName}
            placeholder="e.g. DAAD Development Postgraduate Scholarship"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel required>Slug</FieldLabel>
            <TextInput
              value={form.slug}
              onChange={setSlug}
              placeholder="daad-development-postgraduate"
            />
            {slugPreview && (
              <p className="text-[11px] text-text-secondary mt-1 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                <span className="font-mono">{slugPreview}</span>
                <a
                  href={slugPreview}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </p>
            )}
          </div>
          <div>
            <FieldLabel required>Host country</FieldLabel>
            <TextInput
              value={form.host_country}
              onChange={(v) => set('host_country', v)}
              placeholder="Germany"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Host institution</FieldLabel>
            <TextInput
              value={form.host_institution}
              onChange={(v) => set('host_institution', v)}
              placeholder="Various German Universities"
            />
          </div>
          <div>
            <FieldLabel>Provider</FieldLabel>
            <TextInput
              value={form.provider}
              onChange={(v) => set('provider', v)}
              placeholder="DAAD"
            />
          </div>
        </div>
      </div>

      {/* ── Scope ──────────────────────────────────────────────── */}
      <SectionHeader hint="Comma-separated lists — used by the match engine to score candidates.">
        Scope
      </SectionHeader>
      <div className="space-y-3">
        <div>
          <FieldLabel>Degree levels</FieldLabel>
          <TextInput
            value={form.degree_levels}
            onChange={(v) => set('degree_levels', v)}
            placeholder="master, phd"
          />
        </div>
        <div>
          <FieldLabel>Fields of study</FieldLabel>
          <TextInput
            value={form.fields_of_study}
            onChange={(v) => set('fields_of_study', v)}
            placeholder="engineering, computer_science, public_health"
          />
        </div>
        <div>
          <FieldLabel>Eligible nationalities</FieldLabel>
          <TextInput
            value={form.eligible_nationalities}
            onChange={(v) => set('eligible_nationalities', v)}
            placeholder="Nigerian, African, All"
          />
        </div>
        <div>
          <FieldLabel>Eligible regions</FieldLabel>
          <TextInput
            value={form.eligible_regions}
            onChange={(v) => set('eligible_regions', v)}
            placeholder="Africa, Asia, Latin America"
          />
        </div>
      </div>

      {/* ── Funding ────────────────────────────────────────────── */}
      <SectionHeader>Funding</SectionHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel required>Funding type</FieldLabel>
            <select
              value={form.funding_type}
              onChange={(e) => set('funding_type', e.target.value)}
              className="w-full h-10 px-2 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {FUNDING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel hint="USD / month">
              Monthly stipend
            </FieldLabel>
            <TextInput
              type="number"
              value={form.monthly_stipend_usd}
              onChange={(v) => set('monthly_stipend_usd', v)}
              placeholder="934"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
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
      </div>

      {/* ── Requirements ──────────────────────────────────────── */}
      <SectionHeader>Requirements</SectionHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <CheckboxRow
            label="Requires IELTS"
            checked={form.requires_ielts}
            onChange={(v) => set('requires_ielts', v)}
          />
          <div>
            <FieldLabel>Min IELTS score</FieldLabel>
            <TextInput
              type="number"
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
            label="Requires application fee"
            checked={form.requires_application_fee}
            onChange={(v) => set('requires_application_fee', v)}
            description="Penalized by match engine — most target users can't pay."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Min CGPA</FieldLabel>
            <TextInput
              type="number"
              value={form.min_cgpa}
              onChange={(v) => set('min_cgpa', v)}
              placeholder="3.0"
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
      </div>

      {/* ── Dates ─────────────────────────────────────────────── */}
      <SectionHeader>Dates</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Open date</FieldLabel>
          <TextInput
            type="date"
            value={form.open_date}
            onChange={(v) => set('open_date', v)}
          />
        </div>
        <div>
          <FieldLabel required>Deadline</FieldLabel>
          <TextInput
            type="date"
            value={form.deadline}
            onChange={(v) => set('deadline', v)}
          />
        </div>
        <div>
          <FieldLabel>Program start date</FieldLabel>
          <TextInput
            type="date"
            value={form.program_start_date}
            onChange={(v) => set('program_start_date', v)}
          />
        </div>
        <div>
          <FieldLabel hint="months">Duration</FieldLabel>
          <TextInput
            type="number"
            value={form.duration_months}
            onChange={(v) => set('duration_months', v)}
            placeholder="24"
          />
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <SectionHeader>Content</SectionHeader>
      <div className="space-y-3">
        <div>
          <FieldLabel required>Official URL</FieldLabel>
          <TextInput
            type="url"
            value={form.official_url}
            onChange={(v) => set('official_url', v)}
            placeholder="https://www.daad.de/en/study-and-research-in-germany/scholarships/"
          />
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <TextArea
            value={form.description}
            onChange={(v) => set('description', v)}
            placeholder="What is this scholarship? Who is it for? What does it cover?"
            rows={3}
          />
        </div>
        <div>
          <FieldLabel>Benefits summary</FieldLabel>
          <TextArea
            value={form.benefits_summary}
            onChange={(v) => set('benefits_summary', v)}
            placeholder="Concise bullet-style summary used in the match-detail view."
            rows={2}
          />
        </div>
        <div>
          <FieldLabel>How to apply</FieldLabel>
          <TextArea
            value={form.how_to_apply}
            onChange={(v) => set('how_to_apply', v)}
            placeholder="Step-by-step application instructions."
            rows={2}
          />
        </div>
        <div>
          <FieldLabel>Logo URL</FieldLabel>
          <TextInput
            type="url"
            value={form.logo_url}
            onChange={(v) => set('logo_url', v)}
            placeholder="https://..."
          />
        </div>
      </div>

      {/* ── Status ────────────────────────────────────────────── */}
      <SectionHeader hint="Active = visible to users in /scholarships and /api/matches. Verified = admin-confirmed accuracy.">
        Status
      </SectionHeader>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
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
          placeholder="admin_panel, daad.de, scraped:official_site, etc."
        />
      </div>
    </Drawer>
  );
}
