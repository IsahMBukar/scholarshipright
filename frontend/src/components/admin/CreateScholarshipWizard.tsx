'use client';

// Stepped wizard for creating scholarships.
//
// Same props interface as the admin page expects.
// Organizes the 34-field form into 5 logical steps:
//
//   Step 1: Source    — paste URL (auto-fill) or manual entry
//   Step 2: Identity  — name, slug, country, institution, provider
//   Step 3: Scope     — degree levels, fields, nationalities, regions
//   Step 4: Details   — funding, requirements, dates, documents
//   Step 5: Content   — description, benefits, how to apply, URL, logo
//
// Each step validates its own fields before allowing next.
// URL extraction fills steps 2-5 from a single paste.

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Plus,
  AlertTriangle,
  Info,
  ExternalLink,
  Link2,
  ArrowRight,
  ArrowLeft,
  Globe,
  GraduationCap,
  FileText,
  Calendar,
  CheckCircle2,
  Loader2,
  Sparkles,
} from 'lucide-react';
import Drawer from './ui/Drawer';
import Button from './ui/Button';
import type { AdminScholarshipCreate } from '@/lib/admin/types';
import {
  FUNDING_OPTIONS,
  ENGLISH_TEST_OPTIONS,
  PREVIOUS_DEGREE_OPTIONS,
  STANDARDIZED_TEST_OPTIONS,
  RECOMMENDATION_COUNT_OPTIONS,
  DEGREE_LEVEL_OPTIONS,
  FIELD_OF_STUDY_OPTIONS,
  COUNTRY_OPTIONS,
  REGION_OPTIONS,
  NATIONALITY_SUGGESTIONS,
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
import UnifiedDocumentsEditor from './UnifiedDocumentsEditor';
import MultiSelect from './ui/MultiSelect';

// ── Steps ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 'source', label: 'Source', icon: Globe },
  { id: 'identity', label: 'Identity', icon: GraduationCap },
  { id: 'scope', label: 'Scope', icon: FileText },
  { id: 'details', label: 'Details', icon: Calendar },
  { id: 'content', label: 'Content & Preview', icon: CheckCircle2 },
] as const;

type StepId = (typeof STEPS)[number]['id'];

// ── Props ────────────────────────────────────────────────────────────

export interface CreateScholarshipWizardProps {
  open: boolean;
  onClose: () => void;
  onCreate: (body: AdminScholarshipCreate) => Promise<void>;
  saving: boolean;
  saveError: string | null;
  initialName?: string;
  initialSlugPrefix?: string;
}

// ── Main component ────────────────────────────────────────────────

export default function CreateScholarshipWizard({
  open,
  onClose,
  onCreate,
  saving,
  saveError,
  initialName,
  initialSlugPrefix,
}: CreateScholarshipWizardProps) {
  const [step, setStep] = useState<StepId>('source');
  const [form, setForm] = useState(emptyForm);
  const [validationError, setValidationError] = useState<string | null>(null);

  // URL extraction state
  const [extractUrl, setExtractUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedFields, setExtractedFields] = useState<string[]>([]);

  // Duplicate detection state
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      const next = emptyForm();
      if (initialName) next.name = initialName;
      if (initialSlugPrefix && initialName) {
        next.slug = `${initialSlugPrefix}${slugify(initialName)}`;
        next.slugDirty = true;
      }
      setForm(next);
      setStep('source');
      setValidationError(null);
      setExtractUrl('');
      setExtractError(null);
      setExtractedFields([]);
    }
  }, [open, initialName, initialSlugPrefix]);

  // Auto-fill slug from name
  const setName = useCallback((name: string) => {
    setForm((f) => ({
      ...f,
      name,
      slug: f.slugDirty ? f.slug : slugify(name),
    }));
  }, []);

  // Debounced duplicate detection
  useEffect(() => {
    if (!form.name || form.name.length < 3) {
      setDuplicateWarning(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingDuplicate(true);
      try {
        const resp = await fetch(`/api/admin/scholarships?search=${encodeURIComponent(form.name)}&limit=3`);
        if (resp.ok) {
          const data = await resp.json();
          const matches = (data.items || []).filter(
            (s: any) => s.name?.toLowerCase().includes(form.name.toLowerCase()) ||
                        form.name.toLowerCase().includes(s.name?.toLowerCase())
          );
          if (matches.length > 0) {
            setDuplicateWarning(`Similar scholarship exists: "${matches[0].name}" (${matches[0].host_country})`);
          } else {
            setDuplicateWarning(null);
          }
        }
      } catch {
        // Ignore duplicate check failures
      } finally {
        setCheckingDuplicate(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [form.name]);

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

  const handleDocsChange = useCallback(
    (value: { degree_documents: ScholarshipForm['degree_documents']; custom_documents: ScholarshipForm['custom_documents'] }) => {
      setForm((f) => ({
        ...f,
        degree_documents: value.degree_documents,
        custom_documents: value.custom_documents,
      }));
    },
    []
  );

  // ── URL Extraction ──────────────────────────────────────────────

  const handleExtract = useCallback(async () => {
    if (!extractUrl.trim()) return;
    setExtracting(true);
    setExtractError(null);
    setExtractedFields([]);

    try {
      const resp = await fetch('/api/admin/scholarships/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: extractUrl.trim() }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const fields = data.data as Record<string, any>;

      // Apply extracted fields to form
      setForm((f) => {
        const next = { ...f };
        if (fields.name) { next.name = fields.name; next.slugDirty = false; next.slug = slugify(fields.name); }
        if (fields.host_country) next.host_country = fields.host_country;
        if (fields.host_institution) next.host_institution = fields.host_institution;
        if (fields.provider) next.provider = fields.provider;
        if (fields.funding_type) next.funding_type = fields.funding_type;
        if (fields.deadline) next.deadline = fields.deadline;
        if (fields.official_url) next.official_url = fields.official_url;
        if (fields.degree_levels) next.degree_levels = fields.degree_levels;
        if (fields.fields_of_study) next.fields_of_study = fields.fields_of_study;
        if (fields.eligible_nationalities) next.eligible_nationalities = fields.eligible_nationalities;
        if (fields.eligible_regions) next.eligible_regions = fields.eligible_regions;
        if (fields.covers_tuition !== undefined) next.covers_tuition = fields.covers_tuition;
        if (fields.covers_living !== undefined) next.covers_living = fields.covers_living;
        if (fields.covers_flight !== undefined) next.covers_flight = fields.covers_flight;
        if (fields.covers_health !== undefined) next.covers_health = fields.covers_health;
        if (fields.monthly_stipend_usd) next.monthly_stipend_usd = String(fields.monthly_stipend_usd);
        if (fields.requires_ielts !== undefined) next.requires_ielts = fields.requires_ielts;
        if (fields.min_ielts_score) next.min_ielts_score = String(fields.min_ielts_score);
        if (fields.requires_gre !== undefined) next.requires_gre = fields.requires_gre;
        if (fields.min_cgpa) next.min_cgpa = String(fields.min_cgpa);
        if (fields.language_of_instruction) next.language_of_instruction = fields.language_of_instruction;
        if (fields.open_date) next.open_date = fields.open_date;
        if (fields.program_start_date) next.program_start_date = fields.program_start_date;
        if (fields.duration_months) next.duration_months = String(fields.duration_months);
        if (fields.description) next.description = fields.description;
        if (fields.benefits_summary) next.benefits_summary = fields.benefits_summary;
        if (fields.how_to_apply) next.how_to_apply = fields.how_to_apply;
        if (fields.logo_url) next.logo_url = fields.logo_url;
        if (fields.source) next.source = fields.source;
        return next;
      });

      setExtractedFields(data.fields_found ? Object.keys(fields).filter((k) => fields[k] != null) : []);
      setStep('identity'); // Jump to identity step
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }, [extractUrl]);

  // ── Step validation ─────────────────────────────────────────────

  const validateStep = useCallback((s: StepId): string | null => {
    switch (s) {
      case 'source':
        return null; // Source step is always valid (URL is optional)
      case 'identity':
        if (!form.name.trim()) return 'Name is required.';
        if (!form.slug.trim()) return 'Slug is required.';
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug))
          return 'Slug must be lowercase letters, digits, and dashes only.';
        if (!form.host_country.trim()) return 'Host country is required.';
        return null;
      case 'scope':
        return null; // All optional
      case 'details':
        if (!form.funding_type) return 'Funding type is required.';
        if (!form.deadline) return 'Deadline is required.';
        if (form.monthly_stipend_usd && Number.isNaN(Number(form.monthly_stipend_usd)))
          return 'Monthly stipend must be a number.';
        if (form.min_ielts_score && Number.isNaN(Number(form.min_ielts_score)))
          return 'Min IELTS score must be a number.';
        if (form.min_cgpa && Number.isNaN(Number(form.min_cgpa)))
          return 'Min CGPA must be a number.';
        return null;
      case 'content':
        if (!form.official_url.trim()) return 'Official URL is required.';
        if (!/^https?:\/\//i.test(form.official_url))
          return 'Official URL must start with http:// or https://.';
        return null;
      default:
        return null;
    }
  }, [form]);

  const canGoNext = useMemo(() => {
    return validateStep(step) === null;
  }, [step, validateStep]);

  const handleNext = useCallback(() => {
    const err = validateStep(step);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
  }, [step, validateStep]);

  const handleBack = useCallback(() => {
    setValidationError(null);
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  }, [step]);

  // ── Submit ──────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const err = validateForm(form);
    if (err) {
      setValidationError(err);
      setStep('content'); // Jump to last step to show error
      return;
    }
    setValidationError(null);
    try {
      await onCreate(buildCreateBody(form));
    } catch {
      // Parent sets saveError
    }
  }, [form, onCreate]);

  const displayError = validationError || saveError;
  const currentStepIdx = STEPS.findIndex((s) => s.id === step);

  // ── Slug preview ────────────────────────────────────────────────
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
            <div className="flex items-center gap-2 text-[11px] text-text-secondary min-w-0 flex-1">
              <span>
                Step {currentStepIdx + 1} of {STEPS.length}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {currentStepIdx > 0 && (
              <Button variant="secondary" onClick={handleBack} disabled={saving}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </Button>
            )}
            {currentStepIdx < STEPS.length - 1 ? (
              <Button onClick={handleNext} disabled={!canGoNext}>
                Next
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await handleSave();
                    // Reset form for next entry
                    if (!saveError) {
                      const next = emptyForm();
                      setForm(next);
                      setStep('source');
                      setDuplicateWarning(null);
                    }
                  }}
                  disabled={saving}
                >
                  Save & add another
                </Button>
                <Button
                  onClick={handleSave}
                  loading={saving}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  Create scholarship
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = s.id === step;
          const done = i < currentStepIdx;
          return (
            <button
              key={s.id}
              onClick={() => {
                if (done || i <= currentStepIdx) {
                  setValidationError(null);
                  setStep(s.id);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                active
                  ? 'bg-primary text-white'
                  : done
                  ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {done ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <Icon className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Step 1: Source */}
      {step === 'source' && (
        <div className="space-y-4">
          <SectionHeader hint="Paste a scholarship URL to auto-fill fields, or skip to enter manually.">
            Scholarship Source
          </SectionHeader>

          <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold text-text-primary">
                Smart Extract
              </h3>
            </div>
            <p className="text-xs text-text-secondary">
              Paste the official scholarship URL and we&apos;ll extract the details automatically using AI.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <TextInput
                  value={extractUrl}
                  onChange={setExtractUrl}
                  placeholder="https://www.chevening.org/scholarships/"
                />
              </div>
              <Button
                onClick={handleExtract}
                loading={extracting}
                disabled={!extractUrl.trim()}
                leftIcon={extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              >
                Extract
              </Button>
            </div>
            {extractError && (
              <p className="text-xs text-red-600">{extractError}</p>
            )}
            {extractedFields.length > 0 && (
              <p className="text-xs text-green-700">
                ✓ Extracted {extractedFields.length} fields. Review in the next steps.
              </p>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-text-secondary">or enter manually</span>
            </div>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setStep('identity')}
          >
            Skip — I&apos;ll fill in the fields myself
          </Button>
        </div>
      )}

      {/* Step 2: Identity */}
      {step === 'identity' && (
        <div className="space-y-3">
          <SectionHeader>Identity</SectionHeader>
          <div>
            <FieldLabel required>Name</FieldLabel>
            <TextInput
              value={form.name}
              onChange={setName}
              placeholder="e.g. DAAD Development Postgraduate Scholarship"
            />
            {checkingDuplicate && (
              <p className="text-[11px] text-text-secondary mt-1 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Checking for duplicates...
              </p>
            )}
            {duplicateWarning && !checkingDuplicate && (
              <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {duplicateWarning}
              </p>
            )}
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
                </p>
              )}
            </div>
            <div>
              <FieldLabel required>Host country</FieldLabel>
              <MultiSelect
                multiple={false}
                value={form.host_country || null}
                onChange={(v) => set('host_country', v ?? '')}
                options={COUNTRY_OPTIONS}
                placeholder="Pick a country — type to search…"
                ariaLabel="Host country"
                id="wizard-host-country"
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
      )}

      {/* Step 3: Scope */}
      {step === 'scope' && (
        <div className="space-y-3">
          <SectionHeader hint="Pick from the canonical lists — used by the match engine to score candidates.">
            Scope
          </SectionHeader>
          <div>
            <FieldLabel>Degree levels</FieldLabel>
            <MultiSelect
              multiple
              value={form.degree_levels}
              onChange={(v) => set('degree_levels', v)}
              options={DEGREE_LEVEL_OPTIONS}
              maxVisible={DEGREE_LEVEL_OPTIONS.length}
              placeholder="Pick degree levels…"
              ariaLabel="Degree levels"
              id="wizard-degree-levels"
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
              id="wizard-fields-of-study"
            />
          </div>
          <div>
            <FieldLabel>Eligible nationalities</FieldLabel>
            <MultiSelect
              multiple
              value={form.eligible_nationalities}
              onChange={(v) => set('eligible_nationalities', v)}
              options={NATIONALITY_SUGGESTIONS}
              placeholder="Pick or type nationality groups…"
              ariaLabel="Eligible nationalities"
              id="wizard-eligible-nationalities"
            />
          </div>
          <div>
            <FieldLabel>Eligible regions</FieldLabel>
            <MultiSelect
              multiple
              value={form.eligible_regions}
              onChange={(v) => set('eligible_regions', v)}
              options={REGION_OPTIONS}
              placeholder="Pick regions…"
              ariaLabel="Eligible regions"
              id="wizard-eligible-regions"
            />
          </div>
        </div>
      )}

      {/* Step 4: Details */}
      {step === 'details' && (
        <div className="space-y-4">
          {/* Funding */}
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
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel hint="USD / month">Monthly stipend</FieldLabel>
                <TextInput type="number" value={form.monthly_stipend_usd} onChange={(v) => set('monthly_stipend_usd', v)} placeholder="934" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <CheckboxRow label="Covers tuition" checked={form.covers_tuition} onChange={(v) => set('covers_tuition', v)} />
              <CheckboxRow label="Covers living" checked={form.covers_living} onChange={(v) => set('covers_living', v)} />
              <CheckboxRow label="Covers flight" checked={form.covers_flight} onChange={(v) => set('covers_flight', v)} />
              <CheckboxRow label="Covers health insurance" checked={form.covers_health} onChange={(v) => set('covers_health', v)} />
            </div>
          </div>

          {/* Requirements */}
          <SectionHeader>Requirements</SectionHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <CheckboxRow label="Requires IELTS" checked={form.requires_ielts} onChange={(v) => set('requires_ielts', v)} />
              <div>
                <FieldLabel>Min IELTS score</FieldLabel>
                <TextInput type="number" value={form.min_ielts_score} onChange={(v) => set('min_ielts_score', v)} placeholder="6.5" />
              </div>
              <CheckboxRow label="Requires GRE" checked={form.requires_gre} onChange={(v) => set('requires_gre', v)} />
              <CheckboxRow label="Requires application fee" checked={form.requires_application_fee} onChange={(v) => set('requires_application_fee', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Min CGPA</FieldLabel>
                <TextInput type="number" value={form.min_cgpa} onChange={(v) => set('min_cgpa', v)} placeholder="3.0" />
              </div>
              <div>
                <FieldLabel>Language of instruction</FieldLabel>
                <TextInput value={form.language_of_instruction} onChange={(v) => set('language_of_instruction', v)} placeholder="English" />
              </div>
            </div>
          </div>

          {/* Required Documents */}
          <UnifiedDocumentsEditor
            degreeLevels={form.degree_levels || []}
            onChange={handleDocsChange}
          />

          {/* Dates */}
          <SectionHeader>Dates</SectionHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Deadline</FieldLabel>
                <TextInput type="date" value={form.deadline} onChange={(v) => set('deadline', v)} />
              </div>
              <div>
                <FieldLabel>Open date</FieldLabel>
                <TextInput type="date" value={form.open_date} onChange={(v) => set('open_date', v)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Program start date</FieldLabel>
                <TextInput type="date" value={form.program_start_date} onChange={(v) => set('program_start_date', v)} />
              </div>
              <div>
                <FieldLabel>Duration (months)</FieldLabel>
                <TextInput type="number" value={form.duration_months} onChange={(v) => set('duration_months', v)} placeholder="12" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Content & Preview */}
      {step === 'content' && (
        <div className="space-y-4">
          <SectionHeader>Content</SectionHeader>
          <div className="space-y-3">
            <div>
              <FieldLabel required>Official URL</FieldLabel>
              <TextInput
                value={form.official_url}
                onChange={(v) => set('official_url', v)}
                placeholder="https://www.example.org/scholarships"
              />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <TextArea
                value={form.description}
                onChange={(v) => set('description', v)}
                placeholder="Brief description of the scholarship…"
                rows={3}
              />
            </div>
            <div>
              <FieldLabel>Benefits summary</FieldLabel>
              <TextArea
                value={form.benefits_summary}
                onChange={(v) => set('benefits_summary', v)}
                placeholder="What the scholarship covers…"
                rows={2}
              />
            </div>
            <div>
              <FieldLabel>How to apply</FieldLabel>
              <TextArea
                value={form.how_to_apply}
                onChange={(v) => set('how_to_apply', v)}
                placeholder="Application instructions…"
                rows={2}
              />
            </div>
            <div>
              <FieldLabel>Logo URL</FieldLabel>
              <TextInput
                value={form.logo_url}
                onChange={(v) => set('logo_url', v)}
                placeholder="https://example.org/logo.png"
              />
            </div>
          </div>

          {/* Preview card */}
          <SectionHeader>Preview</SectionHeader>
          <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-text-primary">
                  {form.name || 'Scholarship Name'}
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {form.host_country || 'Country'} · {form.host_institution || 'Institution'}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {FUNDING_OPTIONS.find((o) => o.value === form.funding_type)?.label || 'Funding'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {form.degree_levels.map((d) => (
                <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {d}
                </span>
              ))}
              {form.fields_of_study.slice(0, 3).map((f) => (
                <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {f}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
              {form.deadline && (
                <div>
                  <span className="font-medium">Deadline:</span> {form.deadline}
                </div>
              )}
              {form.monthly_stipend_usd && (
                <div>
                  <span className="font-medium">Stipend:</span> ${form.monthly_stipend_usd}/mo
                </div>
              )}
            </div>
            {form.description && (
              <p className="text-xs text-text-secondary line-clamp-2">{form.description}</p>
            )}
            {(form.name || form.host_country) && (
              <p className="text-[11px] text-primary flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                {slugPreview || '/scholarships/...'}
              </p>
            )}
          </div>

          {/* Status toggles */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 border-t border-gray-100">
            <CheckboxRow label="Active" checked={form.is_active} onChange={(v) => set('is_active', v)} />
            <CheckboxRow label="Verified" checked={form.is_verified} onChange={(v) => set('is_verified', v)} />
          </div>
          <div>
            <FieldLabel>Source</FieldLabel>
            <TextInput value={form.source} onChange={(v) => set('source', v)} placeholder="admin_panel" />
          </div>
        </div>
      )}
    </Drawer>
  );
}
