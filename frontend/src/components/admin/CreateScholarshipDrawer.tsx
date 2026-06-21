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
import {
  FUNDING_OPTIONS,
  ENGLISH_TEST_OPTIONS,
  PREVIOUS_DEGREE_OPTIONS,
  STANDARDIZED_TEST_OPTIONS,
  RECOMMENDATION_COUNT_OPTIONS,
  emptyForm,
  validateForm,
  buildCreateBody,
  slugify,
  type ScholarshipForm,
} from './scholarshipForm';
import {
  FieldLabel,
  TextInput,
  TextArea,
  SectionHeader,
  CheckboxRow,
} from './FormPrimitives';

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
    <K extends keyof ScholarshipForm>(
      key: K,
      value: ScholarshipForm[K]
    ) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    const err = validateForm(form);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    try {
      await onCreate(buildCreateBody(form));
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
        <div className="pt-2 border-t border-gray-100">
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
              const checked = form.accepted_english_tests.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 text-sm cursor-pointer py-1"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      set('accepted_english_tests', e.target.checked
                        ? [...form.accepted_english_tests, opt.value]
                        : form.accepted_english_tests.filter((t) => t !== opt.value));
                    }}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
          {form.accepted_english_tests.length === 0 && (
            <p className="text-[11px] text-amber-700 mt-1">
              ⚠ None selected — the detail page will hide the "Accepted English
              Tests" section for this scholarship.
            </p>
          )}
        </div>
      </div>

      {/* ── Required Documents ───────────────────────────────────── */}
      <SectionHeader hint="What's needed to apply. Defaults are smart for the target degree — override if this scholarship is unusual.">
        Required Documents
      </SectionHeader>
      <div className="space-y-3">
        {/* 8 standard doc booleans — 2-col grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <CheckboxRow
            label="Transcripts"
            checked={form.req_transcripts}
            onChange={(v) => set('req_transcripts', v)}
          />
          <CheckboxRow
            label="CV / Resume"
            checked={form.req_cv_resume}
            onChange={(v) => set('req_cv_resume', v)}
          />
          <CheckboxRow
            label="Statement of Purpose"
            checked={form.req_sop_motivation_letter}
            onChange={(v) => set('req_sop_motivation_letter', v)}
          />
          <CheckboxRow
            label="Recommendation letters"
            checked={form.req_recommendation_letters}
            onChange={(v) => set('req_recommendation_letters', v)}
          />
          <CheckboxRow
            label="English test"
            checked={form.req_english_test}
            onChange={(v) => set('req_english_test', v)}
            description="Uses the accepted English tests above."
          />
          <CheckboxRow
            label="Passport or ID"
            checked={form.req_passport_or_id}
            onChange={(v) => set('req_passport_or_id', v)}
          />
          <CheckboxRow
            label="Financial proof"
            checked={form.req_financial_proof}
            onChange={(v) => set('req_financial_proof', v)}
            description="Usually only needed for visa, not application."
          />
          <CheckboxRow
            label="Passport-size photo"
            checked={form.req_photo}
            onChange={(v) => set('req_photo', v)}
          />
        </div>

        {/* Cement + flexible fields */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
          <div>
            <FieldLabel hint="The previous-degree cert you must already hold.">
              Previous degree required
            </FieldLabel>
            <select
              value={form.previous_degree_required}
              onChange={(e) =>
                set(
                  'previous_degree_required',
                  e.target.value as ScholarshipForm['previous_degree_required']
                )
              }
              className="w-full h-10 px-2 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {PREVIOUS_DEGREE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Recommendation letters</FieldLabel>
            <select
              value={String(form.recommendation_letters_count)}
              onChange={(e) =>
                set(
                  'recommendation_letters_count',
                  e.target.value === 'auto' ? 'auto' : e.target.value
                )
              }
              className="w-full h-10 px-2 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {RECOMMENDATION_COUNT_OPTIONS.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Research proposal</FieldLabel>
            <select
              value={String(form.research_proposal_required)}
              onChange={(e) =>
                set(
                  'research_proposal_required',
                  e.target.value === 'auto' ? 'auto' : e.target.value === 'true'
                )
              }
              className="w-full h-10 px-2 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="auto">Auto (true for PhD)</option>
              <option value="true">Required</option>
              <option value="false">Not required</option>
            </select>
          </div>
          <div>
            <FieldLabel>Writing sample</FieldLabel>
            <select
              value={String(form.writing_sample_required)}
              onChange={(e) =>
                set('writing_sample_required', e.target.value === 'true')
              }
              className="w-full h-10 px-2 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="false">Not required</option>
              <option value="true">Required</option>
            </select>
          </div>
          <div className="col-span-2">
            <FieldLabel>Standardized test</FieldLabel>
            <select
              value={form.standardized_test}
              onChange={(e) =>
                set(
                  'standardized_test',
                  e.target.value as ScholarshipForm['standardized_test']
                )
              }
              className="w-full h-10 px-2 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {STANDARDIZED_TEST_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Long tail */}
        <div className="pt-2 border-t border-gray-100">
          <FieldLabel hint="Anything that doesn't fit a toggle — e.g. portfolio, video essay, scholarship-specific form.">
            Additional required documents
          </FieldLabel>
          <TextArea
            value={form.additional_required_documents}
            onChange={(v) => set('additional_required_documents', v)}
            placeholder="e.g. '2-min video essay' · 'portfolio of 5 design pieces' · 'DS-260 form filled'"
            rows={2}
          />
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
