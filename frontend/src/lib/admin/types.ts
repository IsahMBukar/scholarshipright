// Types matching backend `app/schemas/admin.py` (Phase 1).
// Keep these in sync with backend.

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'viewer';

export interface AdminOverview {
  total_users: number;
  active_users_7d: number;
  new_users_7d: number;
  total_scholarships: number;
  active_scholarships: number;
  total_resumes: number;
  resumes_analyzed_7d: number;
  total_matches_computed: number;
  matches_computed_7d: number;
  total_agent_sessions: number;
  total_saved_scholarships: number;
}

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface AdminAnalytics {
  signups_daily: TimeSeriesPoint[];
  resumes_uploaded_daily: TimeSeriesPoint[];
  agent_messages_daily: TimeSeriesPoint[];
  matches_computed_daily: TimeSeriesPoint[];
}

export interface AdminUser {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_admin: boolean;
  admin_role: AdminRole | null;
  created_at: string;
  last_login_at: string | null;
  resume_count: number;
  saved_count: number;
}

export interface AdminUserListResponse {
  items: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminScholarship {
  id: number;
  slug: string;
  title: string;
  provider: string | null;
  country: string | null;
  funding_type: string | null;
  degree_levels: string[];
  is_active: boolean;
  is_featured: boolean;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  saved_count: number;
  match_count: number;
}

export interface AdminScholarshipListResponse {
  items: AdminScholarship[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminAuditEntry {
  id: number;
  actor_id: number;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AdminAuditListResponse {
  items: AdminAuditEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminInvite {
  id: number;
  email: string;
  role: AdminRole;
  token: string;
  invited_by_id: number;
  invited_by_email: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  is_active: boolean;
  is_expired: boolean;
  is_accepted: boolean;
}

export interface AdminInviteListResponse {
  items: AdminInvite[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateInviteRequest {
  email: string;
  role: AdminRole;
  expires_in_days?: number;
}

export interface CreateInviteResponse {
  invite: AdminInvite;
  accept_url: string;
}
