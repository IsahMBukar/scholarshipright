// Shared scholarship form state + body construction.
//
// Used by both CreateScholarshipDrawer (POST /api/admin/scholarships) and
// the Edit drawer inside /admin/scholarships (PATCH /api/admin/scholarships/{id}).
// Keeping the form shape, validation rules, and serialisation logic in one
// place means the two drawers can't drift apart — the Edit drawer is now a
// full 34-field form, not a partial-fixes-only drawer.
//
// Conventions:
//   - Form state is always strings for numeric/date fields. We parse at
//     build time so empty inputs become "not set" (PATCH) or omitted (POST)
//     rather than "0" or "".
//   - Array fields (degree_levels, fields_of_study, eligible_nationalities,
//     eligible_regions) are entered as comma-separated strings in the UI
//     and split at build time.
//   - funding_type / accepted_english_tests are typed selects (not free text)
//     to keep values in sync with the backend enum and detail-page pills.

import type {
  AdminScholarship,
  AdminScholarshipCreate,
  AdminScholarshipPatch,
} from '@/lib/admin/types';

// ── Form state ────────────────────────────────────────────────────

// Same shape returned by emptyForm() below. Edit drawer pre-populates via
// formFromScholarship() so it doesn't need to track which fields are "set".
export interface ScholarshipForm {
  // Identity
  name: string;
  slug: string;
  slugDirty: boolean; // user has manually edited slug → stop auto-fill (Create only)
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
  monthly_stipend_usd: string;
  // Requirements
  requires_ielts: boolean;
  min_ielts_score: string;
  requires_gre: boolean;
  requires_application_fee: boolean;
  min_cgpa: string;
  language_of_instruction: string;
  // Dates (YYYY-MM-DD or empty)
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
  // English tests accepted (array, displayed as pills on the detail page)
  accepted_english_tests: string[];
}

// ── Option lists ──────────────────────────────────────────────────

// Canonical 3-value set documented in AdminScholarshipCreate. DB is checked:
// every existing scholarship uses 'fully_funded' (17/17), so the 3-option
// dropdown is sufficient and no admin can lose data by editing. If we ever
// extend funding_type, add the option here and both drawers get it.
export const FUNDING_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'fully_funded', label: 'Fully funded' },
  { value: 'partial', label: 'Partial funding' },
  { value: 'stipend_only', label: 'Stipend only' },
];

// English tests shown as quick-checkboxes. Mirrors the detail-page pill list
// and the public language_test filter. Empty array means "no English tests
// required" — overrides the host-country inference on the next migration.
export const ENGLISH_TEST_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'IELTS', label: 'IELTS' },
  { value: 'TOEFL', label: 'TOEFL' },
  { value: 'PTE', label: 'PTE Academic' },
  { value: 'Duolingo', label: 'Duolingo English Test' },
  { value: 'Cambridge', label: 'Cambridge (C1/C2)' },
];

export const DEFAULT_LANGUAGE = 'English';
export const DEFAULT_SOURCE = 'admin_panel';
// Sensible default for English-medium scholarships; admins can override.
export const DEFAULT_ENGLISH_TESTS = ['IELTS', 'TOEFL'];

// ── Form factories ────────────────────────────────────────────────

export function emptyForm(): ScholarshipForm {
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
    is_active: true,
    is_verified: false,
    source: DEFAULT_SOURCE,
    accepted_english_tests: [...DEFAULT_ENGLISH_TESTS],
  };
}

// Pre-populate the form from an existing scholarship record. Used by the
// Edit drawer. We mark slugDirty so the auto-fill rule (Create-only) never
// overwrites the original slug while the user is editing.
export function formFromScholarship(s: AdminScholarship): ScholarshipForm {
  return {
    name: s.name,
    slug: s.slug,
    slugDirty: true,
    host_country: s.host_country,
    host_institution: s.host_institution ?? '',
    provider: s.provider ?? '',
    degree_levels: (s.degree_levels ?? []).join(', '),
    fields_of_study: (s.fields_of_study ?? []).join(', '),
    eligible_nationalities: (s.eligible_nationalities ?? []).join(', '),
    eligible_regions: (s.eligible_regions ?? []).join(', '),
    funding_type: s.funding_type,
    covers_tuition: s.covers_tuition,
    covers_living: s.covers_living,
    covers_flight: s.covers_flight,
    covers_health: s.covers_health,
    monthly_stipend_usd:
      s.monthly_stipend_usd != null ? String(s.monthly_stipend_usd) : '',
    requires_ielts: s.requires_ielts,
    min_ielts_score: s.min_ielts_score != null ? String(s.min_ielts_score) : '',
    requires_gre: s.requires_gre,
    requires_application_fee: s.requires_application_fee,
    min_cgpa: s.min_cgpa != null ? String(s.min_cgpa) : '',
    language_of_instruction: s.language_of_instruction ?? DEFAULT_LANGUAGE,
    open_date: s.open_date ? s.open_date.slice(0, 10) : '',
    deadline: s.deadline ? s.deadline.slice(0, 10) : '',
    program_start_date: s.program_start_date ? s.program_start_date.slice(0, 10) : '',
    duration_months: s.duration_months != null ? String(s.duration_months) : '',
    official_url: s.official_url,
    description: s.description ?? '',
    benefits_summary: s.benefits_summary ?? '',
    how_to_apply: s.how_to_apply ?? '',
    logo_url: s.logo_url ?? '',
    is_active: s.is_active,
    is_verified: s.is_verified,
    source: s.source ?? '',
    accepted_english_tests: [...(s.accepted_english_tests ?? [])],
  };
}

// ── String helpers ────────────────────────────────────────────────

// Auto-derive a URL-safe slug from a name.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

// Parse a comma-separated string into a trimmed, non-empty list.
export function parseList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Validation ────────────────────────────────────────────────────

// Client-side validation shared by both drawers. Returns the first error
// message or null. Backend re-validates; this is purely for UX.
export function validateForm(form: ScholarshipForm): string | null {
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

// ── Body builders ─────────────────────────────────────────────────

// Tiny helpers: opt(v) returns trimmed string or undefined; optNum parses or
// returns undefined. Keeping them local so the build functions read clearly.
function opt(v: string): string | undefined {
  return v.trim() || undefined;
}
function optNum(v: string): number | undefined {
  return v.trim() ? Number(v) : undefined;
}
function optStr(v: string): string | undefined {
  // Unlike opt() we keep the trimmed value even if empty becomes '' — used
  // for PATCH where the user may want to clear a field.
  return v.trim();
}

// Build the POST body. Empty optional fields are omitted so the backend's
// Pydantic schema treats them as "not set" rather than "" or 0.
export function buildCreateBody(form: ScholarshipForm): AdminScholarshipCreate {
  const body: AdminScholarshipCreate = {
    name: form.name.trim(),
    slug: form.slug.trim(),
    host_country: form.host_country.trim(),
    funding_type: form.funding_type,
    deadline: form.deadline,
    official_url: form.official_url.trim(),
  };

  const host_institution = opt(form.host_institution);
  if (host_institution) body.host_institution = host_institution;
  const provider = opt(form.provider);
  if (provider) body.provider = provider;

  const degree_levels = parseList(form.degree_levels);
  if (degree_levels.length) body.degree_levels = degree_levels;
  const fields_of_study = parseList(form.fields_of_study);
  if (fields_of_study.length) body.fields_of_study = fields_of_study;
  const eligible_nationalities = parseList(form.eligible_nationalities);
  if (eligible_nationalities.length) body.eligible_nationalities = eligible_nationalities;
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

  // Always send the array so the backend persists the admin's intent.
  // Empty array (all unchecked) means "no English tests required" and
  // overrides the host-country inference on the next migration.
  body.accepted_english_tests = form.accepted_english_tests;

  return body;
}

// Build the PATCH body. Only fields that differ from the original are sent.
// Required fields (name, host_country, funding_type, deadline, official_url)
// are still sent when they change — the API schema treats all fields as
// Optional, so unchanged fields are simply omitted.
//
// Array fields are compared as sets (order-independent): "a, b" and "b, a"
// are considered the same edit.
export function buildPatchBody(
  form: ScholarshipForm,
  original: AdminScholarship
): AdminScholarshipPatch {
  const body: AdminScholarshipPatch = {};

  // String fields
  const str = (formVal: string, orig: string | null | undefined, key: keyof AdminScholarshipPatch) => {
    const f = formVal.trim();
    const o = (orig ?? '').trim();
    if (f !== o) (body as Record<string, unknown>)[key] = optStr(formVal);
  };

  str(form.name, original.name, 'name');
  str(form.host_country, original.host_country, 'host_country');
  str(form.host_institution, original.host_institution, 'host_institution');
  str(form.provider, original.provider, 'provider');
  str(form.language_of_instruction, original.language_of_instruction, 'language_of_instruction');
  str(form.official_url, original.official_url, 'official_url');
  str(form.description, original.description, 'description');
  str(form.benefits_summary, original.benefits_summary, 'benefits_summary');
  str(form.how_to_apply, original.how_to_apply, 'how_to_apply');
  str(form.logo_url, original.logo_url, 'logo_url');
  str(form.source, original.source, 'source');
  str(form.funding_type, original.funding_type, 'funding_type');

  // Date fields (YYYY-MM-DD compare)
  if (form.deadline !== (original.deadline ? original.deadline.slice(0, 10) : ''))
    body.deadline = form.deadline || undefined;
  if (form.open_date !== (original.open_date ? original.open_date.slice(0, 10) : ''))
    body.open_date = form.open_date || undefined;
  if (form.program_start_date !== (original.program_start_date ? original.program_start_date.slice(0, 10) : ''))
    body.program_start_date = form.program_start_date || undefined;

  // Numeric fields (form is string, original is number|null)
  const num = (formVal: string, orig: number | null, key: keyof AdminScholarshipPatch) => {
    const f = formVal.trim() ? Number(formVal) : null;
    if (f !== orig) {
      (body as Record<string, unknown>)[key] = f === null ? null : f;
    }
  };
  num(form.monthly_stipend_usd, original.monthly_stipend_usd, 'monthly_stipend_usd');
  num(form.min_ielts_score, original.min_ielts_score, 'min_ielts_score');
  num(form.min_cgpa, original.min_cgpa, 'min_cgpa');
  num(form.duration_months, original.duration_months, 'duration_months');

  // Boolean fields — send only if changed. Pydantic accepts null for these
  // (Optional[bool]) so we can use null to mean "don't touch"; we just omit
  // unchanged values.
  const bool = (formVal: boolean, orig: boolean, key: keyof AdminScholarshipPatch) => {
    if (formVal !== orig) (body as Record<string, unknown>)[key] = formVal;
  };
  bool(form.covers_tuition, original.covers_tuition, 'covers_tuition');
  bool(form.covers_living, original.covers_living, 'covers_living');
  bool(form.covers_flight, original.covers_flight, 'covers_flight');
  bool(form.covers_health, original.covers_health, 'covers_health');
  bool(form.requires_ielts, original.requires_ielts, 'requires_ielts');
  bool(form.requires_gre, original.requires_gre, 'requires_gre');
  bool(form.requires_application_fee, original.requires_application_fee, 'requires_application_fee');
  bool(form.is_active, original.is_active, 'is_active');
  bool(form.is_verified, original.is_verified, 'is_verified');

  // Array fields — compare as sets (order-independent)
  const arr = (formVal: string, orig: string[], key: keyof AdminScholarshipPatch) => {
    const parsed = parseList(formVal).sort();
    const was = [...orig].sort();
    if (parsed.length !== was.length || parsed.some((v, i) => v !== was[i])) {
      (body as Record<string, unknown>)[key] = parsed;
    }
  };
  arr(form.degree_levels, original.degree_levels, 'degree_levels');
  arr(form.fields_of_study, original.fields_of_study, 'fields_of_study');
  arr(form.eligible_nationalities, original.eligible_nationalities, 'eligible_nationalities');
  arr(form.eligible_regions, original.eligible_regions, 'eligible_regions');

  // accepted_english_tests — set compare (also preserves order in form)
  const aet = [...form.accepted_english_tests].sort();
  const aetOrig = [...(original.accepted_english_tests ?? [])].sort();
  if (aet.length !== aetOrig.length || aet.some((v, i) => v !== aetOrig[i])) {
    body.accepted_english_tests = form.accepted_english_tests;
  }

  return body;
}
