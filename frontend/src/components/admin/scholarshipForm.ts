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
  PreviousDegree,
  StandardizedTest,
} from '@/lib/admin/types';
import { FIELDS_OF_STUDY } from '@/data/fieldsOfStudy';

// ── Form state ────────────────────────────────────────────────────

// Same shape returned by emptyForm() below. Edit drawer pre-populates via
// formFromScholarship() so it doesn't need to track which fields are "set".
//
// The four "scope" fields (degree_levels, fields_of_study,
// eligible_nationalities, eligible_regions) are `string[]` directly —
// the admin picks values from the canonical token list via the
// MultiSelect combobox, so we no longer round-trip through
// comma-separated strings. This eliminates typo bugs the old free-text
// input had (e.g. "bachelor " vs "Bachelor" vs "Bsc").
export interface ScholarshipForm {
  // Identity
  name: string;
  slug: string;
  slugDirty: boolean; // user has manually edited slug → stop auto-fill (Create only)
  host_country: string;
  host_institution: string;
  provider: string;
  // Scope — arrays of canonical tokens (see CANONICAL_OPTIONS below).
  degree_levels: string[];
  fields_of_study: string[];
  eligible_nationalities: string[];
  eligible_regions: string[];
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
  // Required documents — per-scholarship admin override on top of the
  // backend's auto-derived defaults. 8 booleans for the universal
  // standard docs, then 5 "cement + flexible" fields. The "auto"
  // option in the dropdown signals "let the backend decide" — sending
  // the literal value is also fine (admin override).
  req_transcripts: boolean;
  req_cv_resume: boolean;
  req_sop_motivation_letter: boolean;
  req_recommendation_letters: boolean;
  req_english_test: boolean;
  req_passport_or_id: boolean;
  req_financial_proof: boolean;
  req_photo: boolean;
  // 'auto' sentinel means "use the backend's apply_auto_defaults()".
  // Admins can also pick a concrete value (admin override).
  previous_degree_required: PreviousDegree | 'auto';
  recommendation_letters_count: string;   // number-as-string, parsed at build
  research_proposal_required: boolean | 'auto';
  writing_sample_required: boolean;
  standardized_test: StandardizedTest | 'auto';
  additional_required_documents: string;
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

// Required documents — option lists used by the dropdowns.

// Cement ("previous degree certificate required"). The 'auto' sentinel
// is sent as null in the body and tells the backend to derive from
// degree_levels (see backend/app/services/document_defaults.py).
export const PREVIOUS_DEGREE_OPTIONS: ReadonlyArray<{ value: PreviousDegree | 'auto'; label: string }> = [
  { value: 'auto',                  label: 'Auto (from target degree)' },
  { value: 'high_school_diploma',   label: 'High school diploma (for Bachelor scholarships)' },
  { value: 'bachelor_degree',       label: "Bachelor's degree (for Master's scholarships)" },
  { value: 'master_degree',         label: "Master's degree (for PhD/Doctoral scholarships)" },
  { value: 'none',                  label: 'No previous degree required' },
];

// Standardized test requirement. Same 'auto' sentinel pattern.
export const STANDARDIZED_TEST_OPTIONS: ReadonlyArray<{ value: StandardizedTest | 'auto'; label: string }> = [
  { value: 'auto',     label: 'Auto (from target degree)' },
  { value: 'none',     label: 'No standardized test required' },
  { value: 'sat_act',  label: 'SAT or ACT (typically Undergraduate)' },
  { value: 'gre_gmat', label: 'GRE or GMAT (typically Master\u2019s)' },
  { value: 'gre',      label: 'GRE (typically PhD)' },
  { value: 'gmat',     label: 'GMAT (typically business Master\u2019s)' },
];

// Recommendation letter count option list (1–5 plus auto).
// The 'auto' sentinel is sent as null in the body.
export const RECOMMENDATION_COUNT_OPTIONS: ReadonlyArray<{ value: number | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto (2 for Bachelor/Master’s, 3 for PhD)' },
  { value: 1,      label: '1 letter' },
  { value: 2,      label: '2 letters' },
  { value: 3,      label: '3 letters' },
  { value: 4,      label: '4 letters' },
  { value: 5,      label: '5 letters' },
];

// ── Canonical scope tokens ────────────────────────────────────────
//
// These lists power the MultiSelect comboboxes in the admin drawers.
// Each value is the exact token stored in the database and recognised
// by the backend match engine (see app/services/match_engine.py).
// The label is what the admin sees in the dropdown — admins pick
// from the label, we send the value.
//
// Keep these in sync with the backend's match_engine taxonomy:
//   - DEGREE_LEVEL_OPTIONS matches match_engine.DEGREE_ORDER keys
//     (plus "other" which is advertised by the public filter API).
//   - FIELD_OF_STUDY_OPTIONS is the union of FIELD_SIBLINGS keys and
//     the distinct values already stored in the DB
//     (SELECT DISTINCT unnest(fields_of_study) FROM scholarships).
//   - REGION_OPTIONS matches the existing DB values exactly.

// Canonical degree-level tokens. Sent as-is to the backend, so the
// match engine's DEGREE_ORDER substring match picks them up:
// "bachelor" / "master" / "phd" / "doctoral" / "postdoc" etc.
export const DEGREE_LEVEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'bachelor',    label: 'Bachelor / Undergraduate' },
  { value: 'master',      label: "Master's (MSc, MA, MBA, MPhil)" },
  { value: 'phd',         label: 'PhD / Doctoral' },
  { value: 'postdoc',     label: 'Postdoctoral' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'diploma',     label: 'Diploma' },
  { value: 'associate',   label: 'Associate' },
  { value: 'other',       label: 'Other / unclassified' },
];

// Canonical field-of-study tokens.  Sourced from the exhaustive
// fieldsOfStudy.ts list (2 497 entries).  The MultiSelect typeahead
// searches the full list, so admins can pick any recognised field.
// The match engine uses fuzzy normalisation so both short tokens
// ("computer_science") and full names ("Computer Science") match.
export const FIELD_OF_STUDY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = FIELDS_OF_STUDY;

// Canonical host countries. Comprehensive list — the typeahead shows
// 5 at a time so the long-list UX stays scannable. Free text is also
// allowed for descriptive values like "Multiple EU countries" that
// don't reduce to a single ISO country.
//
// Sorted alphabetically by label for predictable menu order. Values
// are the canonical English short names as commonly used in
// scholarship copy (e.g. "Turkey" instead of "Türkiye" — both are
// present in the DB today; the typeahead matches either).
export const COUNTRY_OPTIONS: ReadonlyArray<string> = [
  'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium',
  'Benin', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil',
  'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo', 'Costa Rica', 'Côte d’Ivoire', 'Croatia', 'Cuba', 'Cyprus',
  'Czech Republic', 'Democratic Republic of the Congo', 'Denmark', 'Djibouti',
  'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Eritrea', 'Estonia',
  'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia',
  'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea', 'Guinea-Bissau',
  'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran',
  'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon',
  'Lesotho', 'Liberia', 'Libya', 'Lithuania', 'Luxembourg', 'Madagascar',
  'Malawi', 'Malaysia', 'Mali', 'Malta', 'Mauritania', 'Mauritius', 'Mexico',
  'Moldova', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
  'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan',
  'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
  'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saudi Arabia', 'Senegal', 'Serbia', 'Sierra Leone', 'Singapore', 'Slovakia',
  'Slovenia', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain',
  'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Taiwan',
  'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Trinidad and Tobago',
  'Tunisia', 'Türkiye', 'Turkey', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay',
  'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

// Canonical region values. The DB has 10 distinct values — we mirror
// them exactly so existing rows round-trip through the MultiSelect.
export const REGION_OPTIONS: ReadonlyArray<string> = [
  'Africa',
  'All regions',
  'Americas',
  'Asia',
  'Caribbean',
  'Europe',
  'Latin America',
  'Middle East',
  'Oceania',
  'Pacific',
];

// Descriptive nationality presets — these are the common patterns in
// existing data ("African countries", "All Chevening-eligible
// countries"). Free text remains available for uncommon ones.
export const NATIONALITY_PRESETS: ReadonlyArray<string> = [
  'All countries',
  'African countries',
  'All developing countries',
  'ASEAN member states',
  'Commonwealth countries',
  'Developing countries',
  'EU citizens',
  'Non-EU/EEA students',
  'US citizens only',
  'US citizens, permanent residents, and nationals',
];

// Combined eligibility list (regions + presets) for the
// eligible_nationalities MultiSelect. The dropdown shows these as
// suggestions; the admin can still type any free-text value.
export const NATIONALITY_SUGGESTIONS: ReadonlyArray<string> = [
  ...NATIONALITY_PRESETS,
  ...REGION_OPTIONS,
];

// ── Form factories ────────────────────────────────────────────────

export function emptyForm(): ScholarshipForm {
  return {
    name: '',
    slug: '',
    slugDirty: false,
    host_country: '',
    host_institution: '',
    provider: '',
    degree_levels: [],
    fields_of_study: [],
    eligible_nationalities: [],
    eligible_regions: [],
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
    // Required documents — all start on the default ('auto' = let the
    // backend derive, or sensible boolean defaults for the booleans).
    req_transcripts: true,
    req_cv_resume: true,
    req_sop_motivation_letter: true,
    req_recommendation_letters: true,
    req_english_test: true,
    req_passport_or_id: true,
    req_financial_proof: false,
    req_photo: false,
    previous_degree_required: 'auto',
    recommendation_letters_count: 'auto',
    research_proposal_required: 'auto',
    writing_sample_required: false,
    standardized_test: 'auto',
    additional_required_documents: '',
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
    degree_levels: [...(s.degree_levels ?? [])],
    fields_of_study: [...(s.fields_of_study ?? [])],
    eligible_nationalities: [...(s.eligible_nationalities ?? [])],
    eligible_regions: [...(s.eligible_regions ?? [])],
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
    // Required documents — pre-populate from the scholarship's stored
    // values. Backend always materialises these on the read side, so
    // s.* is guaranteed non-null for the cement/flexible fields.
    req_transcripts: s.req_transcripts ?? true,
    req_cv_resume: s.req_cv_resume ?? true,
    req_sop_motivation_letter: s.req_sop_motivation_letter ?? true,
    req_recommendation_letters: s.req_recommendation_letters ?? true,
    req_english_test: s.req_english_test ?? true,
    req_passport_or_id: s.req_passport_or_id ?? true,
    req_financial_proof: s.req_financial_proof ?? false,
    req_photo: s.req_photo ?? false,
    previous_degree_required: s.previous_degree_required ?? 'high_school_diploma',
    recommendation_letters_count: s.recommendation_letters_count != null ? String(s.recommendation_letters_count) : '2',
    research_proposal_required: s.research_proposal_required ?? false,
    writing_sample_required: s.writing_sample_required ?? false,
    standardized_test: s.standardized_test ?? 'none',
    additional_required_documents: s.additional_required_documents ?? '',
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

  // Scope arrays — the form already holds them as string[] (the
  // MultiSelect combobox manages them). We omit empty arrays so the
  // backend's Pydantic schema treats them as "not set" rather than [].
  if (form.degree_levels.length) body.degree_levels = form.degree_levels;
  if (form.fields_of_study.length) body.fields_of_study = form.fields_of_study;
  if (form.eligible_nationalities.length) body.eligible_nationalities = form.eligible_nationalities;
  if (form.eligible_regions.length) body.eligible_regions = form.eligible_regions;

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

  // Required documents. Booleans: always send so admin intent is
  // explicit. Cement/flexible: convert 'auto' → null (backend will
  // derive from degree_levels); convert the value → its concrete form.
  body.req_transcripts = form.req_transcripts;
  body.req_cv_resume = form.req_cv_resume;
  body.req_sop_motivation_letter = form.req_sop_motivation_letter;
  body.req_recommendation_letters = form.req_recommendation_letters;
  body.req_english_test = form.req_english_test;
  body.req_passport_or_id = form.req_passport_or_id;
  body.req_financial_proof = form.req_financial_proof;
  body.req_photo = form.req_photo;
  body.previous_degree_required =
    form.previous_degree_required === 'auto' ? null : form.previous_degree_required;
  body.recommendation_letters_count =
    form.recommendation_letters_count === 'auto'
      ? null
      : Number(form.recommendation_letters_count);
  body.research_proposal_required =
    form.research_proposal_required === 'auto' ? null : form.research_proposal_required;
  body.writing_sample_required = form.writing_sample_required;
  body.standardized_test =
    form.standardized_test === 'auto' ? null : form.standardized_test;
  const additional = opt(form.additional_required_documents);
  if (additional) body.additional_required_documents = additional;

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

  // Array fields — compare as sets (order-independent). Form state
  // already holds string[] (no comma-splitting needed); we just sort
  // both sides so ["a","b"] and ["b","a"] are treated as the same.
  const arr = (formVal: string[], orig: string[], key: keyof AdminScholarshipPatch) => {
    const parsed = [...formVal].sort();
    const was = [...orig].sort();
    if (parsed.length !== was.length || parsed.some((v, i) => v !== was[i])) {
      (body as Record<string, unknown>)[key] = formVal;
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

  // Required documents. Booleans diff. Cement/flexible:
  //   'auto'  → null in body
  //   value   → that value in body
  // Compare against the original (always non-null thanks to
  // apply_auto_defaults on the backend read side).
  const docBool = (formVal: boolean, orig: boolean, key: keyof AdminScholarshipPatch) => {
    if (formVal !== orig) (body as Record<string, unknown>)[key] = formVal;
  };
  docBool(form.req_transcripts, original.req_transcripts ?? true, 'req_transcripts');
  docBool(form.req_cv_resume, original.req_cv_resume ?? true, 'req_cv_resume');
  docBool(form.req_sop_motivation_letter, original.req_sop_motivation_letter ?? true, 'req_sop_motivation_letter');
  docBool(form.req_recommendation_letters, original.req_recommendation_letters ?? true, 'req_recommendation_letters');
  docBool(form.req_english_test, original.req_english_test ?? true, 'req_english_test');
  docBool(form.req_passport_or_id, original.req_passport_or_id ?? true, 'req_passport_or_id');
  docBool(form.req_financial_proof, original.req_financial_proof ?? false, 'req_financial_proof');
  docBool(form.req_photo, original.req_photo ?? false, 'req_photo');
  docBool(form.writing_sample_required, original.writing_sample_required ?? false, 'writing_sample_required');

  // Cement — original is always a concrete string (apply_auto_defaults
  // materialises it). If form says 'auto', send null. Otherwise send
  // the concrete value.
  const formCement = form.previous_degree_required;
  const origCement = original.previous_degree_required ?? 'high_school_diploma';
  if (formCement !== origCement) {
    body.previous_degree_required = formCement === 'auto' ? null : formCement;
  }

  // Recommendation count
  const formRecs = form.recommendation_letters_count;
  const formRecsNum = formRecs === 'auto' ? null : Number(formRecs);
  const origRecs = original.recommendation_letters_count ?? 2;
  if (formRecsNum !== origRecs) {
    body.recommendation_letters_count = formRecsNum;
  }

  // Research proposal — 'auto' → null
  const formResearch = form.research_proposal_required;
  const origResearch = original.research_proposal_required ?? false;
  const formResearchBool = formResearch === 'auto' ? null : formResearch;
  if (formResearchBool !== origResearch) {
    body.research_proposal_required = formResearchBool;
  }

  // Standardized test — 'auto' → null
  const formTest = form.standardized_test;
  const origTest = original.standardized_test ?? 'none';
  if (formTest !== origTest) {
    body.standardized_test = formTest === 'auto' ? null : formTest;
  }

  // Additional (long tail) — string diff, empty string means "clear it"
  const formAdd = (form.additional_required_documents ?? '').trim();
  const origAdd = (original.additional_required_documents ?? '').trim();
  if (formAdd !== origAdd) {
    body.additional_required_documents = formAdd || null;
  }

  return body;
}
