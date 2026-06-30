// Thin wrapper functions around the admin API.
// Each function maps 1:1 to a backend route from Phase 1.

import { adminFetch } from './client';
import type {
  OverviewResponse,
  AnalyticsResponse,
  AdminUser,
  AdminUserPatch,
  AdminScholarship,
  AdminScholarshipCreate,
  AdminScholarshipPatch,
  AdminAuditEntry,
  AdminInviteListEntry,
  CreateInviteRequest,
  AdminInviteResponse,
  AdminRole,
  PaginatedResponse,
  AdminCountryGroup,
  GroupCreateRequest,
  GroupUpdateRequest,
  CountryOption,
} from './types';

// Re-export common types for callers.
export type { AdminUser, AdminScholarship, AdminAuditEntry };

// ── List param shapes (real backend param names) ──────────────────
export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
  is_admin?: boolean;
  sort?: 'newest' | 'oldest' | 'email_asc' | 'last_active';
}

export interface ListScholarshipsParams {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
  is_verified?: boolean;
  funding_type?: string;
  country?: string;
  sort?: 'newest' | 'oldest' | 'deadline_asc' | 'name';
}

export interface ListAuditParams {
  page?: number;
  limit?: number;
  action?: string;
  target_type?: string;
  admin_id?: string;
  since?: string; // ISO datetime
  until?: string; // ISO datetime
}

export interface ListInvitesParams {
  page?: number;
  limit?: number;
  include_accepted?: boolean;
  include_revoked?: boolean;
}

// ── API surface ───────────────────────────────────────────────────
export const adminApi = {
  // Overview / analytics
  getOverview: () => adminFetch<OverviewResponse>('/api/admin/overview'),
  getAnalytics: (range_days: number = 30) =>
    adminFetch<AnalyticsResponse>('/api/admin/analytics', {
      params: { range_days },
    }),

  // Users
  listUsers: (params: ListUsersParams = {}) =>
    adminFetch<PaginatedResponse<AdminUser>>('/api/admin/users', { params }),

  updateUser: (id: string, body: AdminUserPatch) =>
    adminFetch<AdminUser>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body,
    }),

  // Scholarships
  listScholarships: (params: ListScholarshipsParams = {}) =>
    adminFetch<PaginatedResponse<AdminScholarship>>(
      '/api/admin/scholarships',
      { params }
    ),

  createScholarship: (body: AdminScholarshipCreate) =>
    adminFetch<AdminScholarship>('/api/admin/scholarships', {
      method: 'POST',
      body,
    }),

  patchScholarship: (id: string, body: AdminScholarshipPatch) =>
    adminFetch<AdminScholarship>(`/api/admin/scholarships/${id}`, {
      method: 'PATCH',
      body,
    }),

  deleteScholarship: (id: string) =>
    adminFetch<{ ok: true }>(`/api/admin/scholarships/${id}`, {
      method: 'DELETE',
    }),

  // Audit
  listAudit: (params: ListAuditParams = {}) =>
    adminFetch<PaginatedResponse<AdminAuditEntry>>('/api/admin/audit', {
      params,
    }),

  // Invites
  listInvites: (params: ListInvitesParams = {}) =>
    adminFetch<PaginatedResponse<AdminInviteListEntry>>(
      '/api/admin/invites',
      { params }
    ),

  createInvite: (body: CreateInviteRequest) =>
    adminFetch<AdminInviteResponse>('/api/admin/invites', {
      method: 'POST',
      body,
    }),

  revokeInvite: (id: string) =>
    adminFetch<{ ok: true }>(`/api/admin/invites/${id}`, { method: 'DELETE' }),

  // Country Groups
  listGroups: (params: { status?: string; search?: string } = {}) =>
    adminFetch<{ items: AdminCountryGroup[]; total: number }>('/api/admin/groups', { params }),

  getGroup: (code: string) =>
    adminFetch<AdminCountryGroup>(`/api/admin/groups/${code}`),

  createGroup: (body: GroupCreateRequest) =>
    adminFetch<AdminCountryGroup>('/api/admin/groups', {
      method: 'POST',
      body,
    }),

  updateGroup: (code: string, body: GroupUpdateRequest) =>
    adminFetch<AdminCountryGroup>(`/api/admin/groups/${code}`, {
      method: 'PUT',
      body,
    }),

  deleteGroup: (code: string) =>
    adminFetch<{ deprecated: boolean }>(`/api/admin/groups/${code}`, {
      method: 'DELETE',
    }),

  getGroupUsage: (code: string) =>
    adminFetch<{ group_code: string; group_name: string; scholarship_count: number; scholarships: Array<{ id: string; title: string }> }>(
      `/api/admin/groups/${code}/usage`
    ),

  // Countries (for pickers)
  listCountries: (search?: string) =>
    adminFetch<CountryOption[]>('/api/admin/countries', {
      params: search ? { search } : {},
    }),

  // Eligibility preview
  previewEligibility: (body: {
    included_groups?: string[];
    included_countries?: string[];
    excluded_groups?: string[];
    excluded_countries?: string[];
  }) =>
    adminFetch<{ resolved_count: number; unresolved: boolean; countries: { code: string; name: string }[] }>(
      '/api/admin/groups/preview',
      { method: 'POST', body }
    ),
};

// ── Admin identity (returned by /api/auth/me) ─────────────────────
export interface AdminIdentity {
  id: string;
  email: string;
  is_admin: boolean;
  admin_role: AdminRole | null;
}
