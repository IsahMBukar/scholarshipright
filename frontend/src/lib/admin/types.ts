// Types matching backend `app/schemas/admin.py`.
// These mirror the real Pydantic schemas. If backend changes, update here too.
//
// Verified against backend on 2026-06-16: shapes match the actual
// `PaginatedResponse`, `OverviewResponse`, `AnalyticsResponse`,
// `AdminUserResponse`, `AdminScholarshipResponse`, `AdminAuditEntry`,
// `AdminInviteResponse`, `AdminInviteListEntry`.

// ── Envelope ──────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Overview / analytics ──────────────────────────────────────────
export type KpiFormat = 'number' | 'percent' | 'currency' | 'duration';

export interface OverviewKPI {
  key: string; // e.g. "total_users"
  label: string; // e.g. "Total users"
  value: number;
  format: KpiFormat;
  delta: number | null; // % change vs previous period (positive = up)
  delta_period: string | null; // e.g. "vs last 30d"
}

export interface OverviewResponse {
  kpis: OverviewKPI[];
  recent_signups_7d: Array<{ date: string; count: number }>;
  recent_match_computes_7d: Array<{ date: string; count: number }>;
  generated_at: string;
}

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD or full ISO datetime
  value: number;
  label?: string; // category label for distributions (country, funding type)
}

export interface AnalyticsSeries {
  key: string; // "signups" | "resume_uploads" | "match_computes" | "chat_sessions" | "saved_scholarships" | "scholarship_by_country" | "scholarship_by_funding"
  label: string;
  points: TimeSeriesPoint[];
}

export interface AnalyticsResponse {
  range_days: number;
  series: AnalyticsSeries[];
  generated_at: string;
}

// ── Users ─────────────────────────────────────────────────────────
export type AdminRole = 'super_admin' | 'support_staff';

export interface AdminUser {
  id: string; // UUID
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_admin: boolean;
  admin_role: AdminRole | null;
  created_at: string;
  updated_at: string;
  resume_count: number;
  saved_count: number;
  last_active_at: string | null;
}

export type UsersListResponse = PaginatedResponse<AdminUser>;

// Patch body — backend AdminUserPatch: full_name, is_active, admin_role (with "remove" sentinel to clear role)
export interface AdminUserPatch {
  full_name?: string;
  is_active?: boolean;
  // Use "remove" string to clear admin role, or set to a valid AdminRole.
  admin_role?: AdminRole | 'remove';
}

// ── Scholarships ──────────────────────────────────────────────────

// Values for the "cement" (previous-degree certificate) field. Keep in
// sync with backend/app/services/document_defaults.py::PREVIOUS_DEGREE_OPTIONS.
export type PreviousDegree =
  | 'high_school_diploma'
  | 'bachelor_degree'
  | 'master_degree'
  | 'none';

// Values for the standardized test field. Keep in sync with
// backend/app/services/document_defaults.py::STANDARDIZED_TEST_OPTIONS.
export type StandardizedTest =
  | 'none'
  | 'sat_act'
  | 'gre_gmat'
  | 'gre'
  | 'gmat';

export interface AdminScholarship {
  id: string; // UUID
  name: string;
  slug: string;
  host_country: string;
  host_institution: string | null;
  provider: string | null;
  degree_levels: string[];
  fields_of_study: string[];
  eligible_nationalities: string[];
  eligible_regions: string[];
  funding_type: string;
  covers_tuition: boolean;
  covers_living: boolean;
  covers_flight: boolean;
  covers_health: boolean;
  monthly_stipend_usd: number | null;
  requires_ielts: boolean;
  min_ielts_score: number | null;
  requires_gre: boolean;
  requires_application_fee: boolean;
  min_cgpa: number | null;
  language_of_instruction: string;
  open_date: string | null;
  deadline: string | null;
  program_start_date: string | null;
  duration_months: number | null;
  description: string | null;
  benefits_summary: string | null;
  how_to_apply: string | null;
  official_url: string;
  logo_url: string | null;
  accepted_english_tests: string[];
  // Required documents — admin override on top of auto-derived defaults.
  // 8 booleans (true/false), then the 5 "cement + flexible" fields
  // (always materialised by apply_auto_defaults on the backend read
  // side, so they're guaranteed non-null in API responses).
  req_transcripts: boolean;
  req_cv_resume: boolean;
  req_sop_motivation_letter: boolean;
  req_recommendation_letters: boolean;
  req_english_test: boolean;
  req_passport_or_id: boolean;
  req_financial_proof: boolean;
  req_photo: boolean;
  previous_degree_required: PreviousDegree;
  recommendation_letters_count: number;
  research_proposal_required: boolean;
  writing_sample_required: boolean;
  standardized_test: StandardizedTest;
  additional_required_documents: string | null;
  is_active: boolean;
  is_verified: boolean;
  source: string | null;
  view_count: number;
  application_count: number;
  created_at: string;
  updated_at: string;
}

export type ScholarshipsListResponse = PaginatedResponse<AdminScholarship>;

// AdminScholarshipPatch: matches the backend `AdminScholarshipPatch` in
// backend/app/schemas/admin.py — every field the API can update. We
// type the full set (not just the ones we use in UI) so the shared
// `buildPatchBody()` in scholarshipForm.ts compiles. The diff-based
// PATCH builder only includes fields that actually changed.
export interface AdminScholarshipPatch {
  // Identity
  name?: string;
  host_country?: string;
  host_institution?: string | null;
  provider?: string | null;
  // Scope
  degree_levels?: string[] | null;
  fields_of_study?: string[] | null;
  eligible_nationalities?: string[] | null;
  eligible_regions?: string[] | null;
  // Funding
  funding_type?: string;
  covers_tuition?: boolean | null;
  covers_living?: boolean | null;
  covers_flight?: boolean | null;
  covers_health?: boolean | null;
  monthly_stipend_usd?: number | null;
  // Requirements
  requires_ielts?: boolean | null;
  min_ielts_score?: number | string | null;
  requires_gre?: boolean | null;
  requires_application_fee?: boolean | null;
  min_cgpa?: number | string | null;
  language_of_instruction?: string | null;
  // Dates
  open_date?: string | null;
  deadline?: string | null;
  program_start_date?: string | null;
  duration_months?: number | null;
  // Content
  description?: string | null;
  benefits_summary?: string | null;
  how_to_apply?: string | null;
  official_url?: string;
  logo_url?: string | null;
  accepted_english_tests?: string[] | null;
  // Required documents — admin can override any of these. null means
  // "don't change" on PATCH. Backend's apply_auto_defaults() will
  // materialise null fields at read time using degree_levels.
  req_transcripts?: boolean | null;
  req_cv_resume?: boolean | null;
  req_sop_motivation_letter?: boolean | null;
  req_recommendation_letters?: boolean | null;
  req_english_test?: boolean | null;
  req_passport_or_id?: boolean | null;
  req_financial_proof?: boolean | null;
  req_photo?: boolean | null;
  previous_degree_required?: PreviousDegree | null;
  recommendation_letters_count?: number | null;
  research_proposal_required?: boolean | null;
  writing_sample_required?: boolean | null;
  standardized_test?: StandardizedTest | null;
  additional_required_documents?: string | null;
  // Status
  is_active?: boolean | null;
  is_verified?: boolean | null;
  source?: string | null;
}

// AdminScholarshipCreate: all fields the backend POST /api/admin/scholarships
// accepts. Required: name, slug, host_country, funding_type, deadline,
// official_url. Everything else is optional. Date fields accept ISO strings
// (YYYY-MM-DD). Numeric fields accept strings or numbers (adminFetch
// serialises as JSON). Array fields accept string[] OR comma-separated
// strings (the form does the splitting client-side).
export interface AdminScholarshipCreate {
  // Required
  name: string;
  slug: string;
  host_country: string;
  funding_type: string;
  deadline: string;
  official_url: string;
  // Optional — identity
  host_institution?: string | null;
  provider?: string | null;
  // Optional — scope
  degree_levels?: string[] | null;
  fields_of_study?: string[] | null;
  eligible_nationalities?: string[] | null;
  eligible_regions?: string[] | null;
  // Optional — funding
  covers_tuition?: boolean | null;
  covers_living?: boolean | null;
  covers_flight?: boolean | null;
  covers_health?: boolean | null;
  monthly_stipend_usd?: number | null;
  // Optional — requirements
  requires_ielts?: boolean | null;
  min_ielts_score?: number | string | null;
  requires_gre?: boolean | null;
  requires_application_fee?: boolean | null;
  min_cgpa?: number | string | null;
  language_of_instruction?: string | null;
  // Optional — dates
  open_date?: string | null;
  program_start_date?: string | null;
  duration_months?: number | null;
  // Optional — content
  description?: string | null;
  benefits_summary?: string | null;
  how_to_apply?: string | null;
  logo_url?: string | null;
  // English tests accepted (e.g. ["IELTS", "TOEFL"]). When omitted/null
  // the backend's runtime migration backfills via host-country inference.
  accepted_english_tests?: string[] | null;
  // Required documents — null means "use the auto default derived from
  // degree_levels". On Create the API materialises nulls via
  // apply_auto_defaults() before persisting.
  req_transcripts?: boolean | null;
  req_cv_resume?: boolean | null;
  req_sop_motivation_letter?: boolean | null;
  req_recommendation_letters?: boolean | null;
  req_english_test?: boolean | null;
  req_passport_or_id?: boolean | null;
  req_financial_proof?: boolean | null;
  req_photo?: boolean | null;
  previous_degree_required?: PreviousDegree | null;
  recommendation_letters_count?: number | null;
  research_proposal_required?: boolean | null;
  writing_sample_required?: boolean | null;
  standardized_test?: StandardizedTest | null;
  additional_required_documents?: string | null;
  // Optional — status
  is_active?: boolean | null;
  is_verified?: boolean | null;
  source?: string | null;
}

// ── Audit log ─────────────────────────────────────────────────────
export interface AdminAuditEntry {
  id: string; // UUID
  admin_id: string | null; // UUID
  admin_email: string | null;
  action: string; // e.g. "user.update"
  target_type: string; // e.g. "user", "scholarship"
  target_id: string | null;
  payload: Record<string, unknown> | null; // not `details`
  created_at: string;
}

export type AuditListResponse = PaginatedResponse<AdminAuditEntry>;

// ── Invites ───────────────────────────────────────────────────────
export interface AdminInviteListEntry {
  id: string; // UUID
  email: string;
  admin_role: AdminRole; // only "super_admin" | "support_staff"
  invited_by_email: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export type InvitesListResponse = PaginatedResponse<AdminInviteListEntry>;

export interface CreateInviteRequest {
  email: string;
  admin_role: AdminRole; // only "super_admin" | "support_staff"
  note?: string;
}

export interface AdminInviteResponse {
  id: string; // UUID
  email: string;
  admin_role: string;
  invite_url: string; // absolute magic link (shown ONCE)
  expires_at: string;
  created_at: string;
}

// ── Country Groups ────────────────────────────────────────────────

export interface CountryGroupMember {
  code: string;
  name: string;
}

export interface AdminCountryGroup {
  id: string;
  code: string;
  name: string;
  description: string | null;
  source_url: string | null;
  source_date: string | null;
  status: 'active' | 'deprecated';
  member_count: number;
  members: CountryGroupMember[];
  scholarship_count: number;
  created_at: string;
  updated_at: string;
}

export interface GroupCreateRequest {
  code: string;
  name: string;
  description?: string;
  source_url?: string;
  source_date?: string;
  members: string[]; // ISO alpha-2 codes
}

export interface GroupUpdateRequest {
  name?: string;
  description?: string;
  source_url?: string;
  source_date?: string;
  members?: string[]; // ISO alpha-2 codes (replaces current)
}

export interface CountryOption {
  code: string;
  name: string;
  iso3?: string;
}

// ── Pending Review Queue ──────────────────────────────────────────

export interface PendingScholarship {
  id: string;
  payload: Record<string, any>;
  submitted_by: string;
  agent_key_id: string | null;
  status: 'pending_review' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  approved_scholarship_id: string | null;
  duplicate_of: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}
