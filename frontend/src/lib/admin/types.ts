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
  is_active: boolean;
  is_verified: boolean;
  source: string | null;
  view_count: number;
  application_count: number;
  created_at: string;
  updated_at: string;
}

export type ScholarshipsListResponse = PaginatedResponse<AdminScholarship>;

// AdminScholarshipPatch: name, host_country, host_institution, provider,
// funding_type, deadline, official_url, is_active, is_verified, plus the
// various list/bool/numeric fields. We only type the fields we use in UI.
export interface AdminScholarshipPatch {
  is_active?: boolean;
  is_verified?: boolean;
  name?: string;
  host_country?: string;
  funding_type?: string;
  deadline?: string;
  official_url?: string;
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
