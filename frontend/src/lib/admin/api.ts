// Thin wrapper functions around the admin API.
// Each function maps 1:1 to a backend route from Phase 1.

import { adminFetch } from './client';
import type {
  AdminOverview,
  AdminAnalytics,
  AdminUserListResponse,
  AdminScholarshipListResponse,
  AdminAuditListResponse,
  AdminInviteListResponse,
  CreateInviteRequest,
  CreateInviteResponse,
  AdminRole,
} from './types';

export interface ListUsersParams {
  page?: number;
  page_size?: number;
  search?: string;
  is_active?: boolean;
  is_admin?: boolean;
}

export const adminApi = {
  // Overview / analytics
  getOverview: () => adminFetch<AdminOverview>('/api/admin/overview'),
  getAnalytics: (days: number = 30) =>
    adminFetch<AdminAnalytics>('/api/admin/analytics', { params: { days } }),

  // Users
  listUsers: (params: ListUsersParams = {}) =>
    adminFetch<AdminUserListResponse>('/api/admin/users', { params }),

  updateUser: (
    id: number,
    body: { is_active?: boolean; is_admin?: boolean; admin_role?: AdminRole | null }
  ) =>
    adminFetch<{ ok: true }>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body,
    }),

  // Scholarships
  listScholarships: (params: ListUsersParams = {}) =>
    adminFetch<AdminScholarshipListResponse>('/api/admin/scholarships', { params }),

  setScholarshipActive: (id: number, is_active: boolean) =>
    adminFetch<{ ok: true }>(`/api/admin/scholarships/${id}`, {
      method: 'PATCH',
      body: { is_active },
    }),

  // Audit
  listAudit: (params: ListUsersParams & { action?: string } = {}) =>
    adminFetch<AdminAuditListResponse>('/api/admin/audit', { params }),

  // Invites
  listInvites: (params: ListUsersParams = {}) =>
    adminFetch<AdminInviteListResponse>('/api/admin/invites', { params }),

  createInvite: (body: CreateInviteRequest) =>
    adminFetch<CreateInviteResponse>('/api/admin/invites', {
      method: 'POST',
      body,
    }),

  revokeInvite: (id: number) =>
    adminFetch<{ ok: true }>(`/api/admin/invites/${id}`, { method: 'DELETE' }),
};
