'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Re-export the admin required-documents type aliases so the public
// `Scholarship` shape uses the exact same vocabulary as the admin
// side. Single source of truth in @/lib/admin/types.
import type { PreviousDegree, StandardizedTest } from '@/lib/admin/types';
export type { PreviousDegree, StandardizedTest };

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export interface MatchBreakdown {
  // Numeric criterion scores
  semantic?: number;          // max 30 (cosine sim × 30)
  field?: number;             // max 15, min 0
  country?: number;           // max 10, min -25
  degree?: number;            // max 12, min -25
  academic?: number;          // max 10, min -12
  language?: number;          // max 8, min -8
  resume_keywords?: number;   // max 15, min 0
  research_experience?: number; // max 10, min 0
  funding_fit?: number;       // max 6, min 0
  target_country?: number;    // max 4, min 0
  start_date?: number;        // max 4, min 0
  fee?: number;               // max 3, min -5
  // Diagnostics
  resume_keyword_details?: {
    overlap: string[];
    coverage: number;
    message?: string;
  };
  research_experience_details?: {
    signals: string[];
    research_or_grad_program: boolean;
  };
  hard_flags?: string[];
  scoring_version?: string;
}

export interface Scholarship {
  id: string;
  name: string;
  slug: string;
  host_country: string;
  host_institution?: string;
  provider?: string;
  degree_levels: string[];
  fields_of_study: string[];
  eligible_nationalities: string[];
  funding_type: string;
  covers_tuition: boolean;
  covers_living: boolean;
  covers_flight: boolean;
  covers_health: boolean;
  monthly_stipend_usd?: number;
  requires_ielts: boolean;
  min_ielts_score?: number;
  accepted_english_tests?: string[];
  requires_application_fee: boolean;
  min_cgpa?: number;
  language_of_instruction?: string;
  open_date?: string;
  deadline: string;
  program_start_date?: string;
  duration_months?: number;
  description?: string;
  benefits_summary?: string;
  how_to_apply?: string;
  official_url: string;
  logo_url?: string;
  is_verified: boolean;
  source?: string;
  view_count?: number;
  application_count?: number;
  match_score?: number;
  match_breakdown?: MatchBreakdown;
  // Required documents — always materialised on the backend read side
  // (see apply_auto_defaults) so all fields are guaranteed non-null.
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
}

export interface ScholarshipListResponse {
  items: Scholarship[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Profile {
  id: string;
  user_id: string;
  degree_level?: string;
  cgpa?: number;
  cgpa_scale?: number;
  degree_class?: string;
  field_of_study?: string;
  graduation_year?: number;
  university?: string;
  country_of_origin?: string;
  research_interests: string[];
  work_experience_years?: number;
  target_degree?: string;
  target_fields: string[];
  target_start_date?: string;
  target_countries: string[];
  has_ielts: boolean;
  ielts_score?: number;
  // English-language study waiver — true when the user's prior degree
  // was taught in English. The matching engine treats this as a soft
  // waiver for English-test requirements. See backend
  // app/services/match_engine.english_test_score.
  prior_studies_in_english: boolean;
}

// API client
const api = axios.create({ baseURL: API_URL, withCredentials: true });

// Filter metadata — the canonical list of every filter value the
// backend supports, plus display labels. The FilterPanel renders
// directly from this so a new scholarship row in the DB shows up
// in the dropdown without a frontend deploy.
export interface FilterMetadata {
  countries: string[];
  fields: string[];
  degrees: string[];
  funding_types: string[];
  english_tests: string[];
  degree_labels: Record<string, string>;
  funding_labels: Record<string, string>;
}

let _filterMetadataCache: FilterMetadata | null = null;
let _filterMetadataInflight: Promise<FilterMetadata> | null = null;

export async function fetchFilterMetadata(force = false): Promise<FilterMetadata> {
  if (!force && _filterMetadataCache) return _filterMetadataCache;
  if (!force && _filterMetadataInflight) return _filterMetadataInflight;
  _filterMetadataInflight = api
    .get<FilterMetadata>('/api/scholarships/filters/metadata')
    .then((r) => {
      _filterMetadataCache = r.data;
      return r.data;
    })
    .finally(() => {
      _filterMetadataInflight = null;
    });
  return _filterMetadataInflight;
}

// Scholarships API
export async function fetchScholarships(params: Record<string, string> = {}): Promise<ScholarshipListResponse> {
  const { data } = await api.get('/api/scholarships', { params });
  return data;
}

export async function fetchScholarship(slug: string): Promise<Scholarship> {
  const { data } = await api.get(`/api/scholarships/${slug}`);
  return data;
}

export async function incrementScholarshipView(slug: string): Promise<void> {
  await api.post(`/api/scholarships/${slug}/view`).catch(() => {});
}

export async function fetchFeaturedScholarships(): Promise<Scholarship[]> {
  const { data } = await api.get('/api/scholarships/featured');
  return data;
}

// Profile API
export async function fetchProfile(): Promise<Profile | null> {
  // /api/profile returns 404 when the user has no Profile row yet (e.g. a
  // brand-new invitee who just signed up). That's an expected state during
  // onboarding, not an error — return null so callers can distinguish.
  try {
    const { data } = await api.get('/api/profile');
    return data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

// Auth API
export interface MeUser {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  admin_role: string | null;
  has_password: boolean;
}

export async function fetchMe(): Promise<MeUser> {
  const { data } = await api.get('/api/auth/me');
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post('/api/auth/set-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export async function createOrUpdateProfile(profile: Partial<Profile>): Promise<Profile> {
  const { data } = await api.post('/api/profile', profile);
  return data;
}

// Matches API
export async function fetchMatches(): Promise<Array<{ scholarship: Scholarship; score: number; breakdown: Record<string, number> }>> {
  const { data } = await api.get('/api/matches');
  return data;
}

// Saved Scholarships API
export async function fetchSavedScholarships(statusFilter?: string): Promise<Array<Scholarship & { status: string; notes?: string; reminder_enabled: boolean }>> {
  const params: Record<string, string> = {};
  if (statusFilter) params.status = statusFilter;
  const { data } = await api.get('/api/saved', { params });
  return data;
}

export async function saveScholarship(scholarshipId: string): Promise<any> {
  const { data } = await api.post(`/api/saved/${scholarshipId}`);
  return data;
}

export async function updateSavedScholarship(scholarshipId: string, update: { status?: string; notes?: string; reminder_enabled?: boolean }): Promise<any> {
  const { data } = await api.put(`/api/saved/${scholarshipId}`, update);
  return data;
}

export async function removeSavedScholarship(scholarshipId: string): Promise<void> {
  await api.delete(`/api/saved/${scholarshipId}`);
}

export interface ApplicationStats {
  total: number;
  saved: number;
  applying: number;
  applied: number;
  reviewing: number;
  accepted: number;
  rejected: number;
}

export async function fetchApplicationStats(): Promise<ApplicationStats> {
  const { data } = await api.get('/api/saved/stats');
  return data;
}

// Resume API
export interface LevelAwareCompleteness {
  level: 'high_school' | 'bachelor' | 'master' | 'phd' | string;
  level_label: string;
  base_score: number;
  bonus_score: number;
  total_score: number;
  display_score: number;
  grade: 'Excellent' | 'Strong' | 'Fair' | 'Incomplete' | string;
  present_required: string[];
  missing_required: string[];
  present_bonus: string[];
  present_bonus_count: number;
  required_count: number;
  hint: string;
}

export interface Resume {
  id: string;
  user_id: string;
  title: string;
  target_fields: string[];
  target_degree: string | null;
  is_primary: boolean;
  status: string;
  original_filename: string | null;
  original_mime_type: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  summary: string | null;
  education: any[];
  experience: any[];
  research_projects: any[];
  skills: string[];
  certifications: any[];
  publications: any[];
  languages: any[];
  projects: any[];
  awards: any[];
  ref_list: any[];
  analysis: Record<string, any>;
  issues: any[];
  ai_suggestions: string | null;
  overall_score: number | null;
  level_aware_completeness: LevelAwareCompleteness | null;
  created_at: string;
  updated_at: string;
}

export interface ResumeIssue {
  field: string;
  severity: 'urgent' | 'severe' | 'likely';
  message: string;
  suggestion?: string;
}

export async function fetchResumes(): Promise<Resume[]> {
  const { data } = await api.get('/api/resumes');
  return data;
}

export async function fetchResume(id: string): Promise<Resume> {
  const { data } = await api.get(`/api/resumes/${id}`);
  return data;
}

export async function uploadResume(file: File, title: string, targetFields: string[], targetDegree: string): Promise<Resume> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  formData.append('target_fields', JSON.stringify(targetFields));
  formData.append('target_degree', targetDegree);
  const { data } = await api.post('/api/resumes', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data;
}

// Manual path: create a stub resume record with no file. Used by users
// who don't have a CV to upload but still want to fill in education,
// work, and skills manually via the profile page edit modals.
// Idempotent on the server side — returns the existing manual resume
// if one already exists.
export async function createManualResume(): Promise<Resume> {
  const { data } = await api.post('/api/resumes/manual');
  return data;
}

export async function updateResume(id: string, update: Partial<Resume>): Promise<Resume> {
  const { data } = await api.put(`/api/resumes/${id}`, update);
  return data;
}

export async function deleteResume(id: string): Promise<void> {
  await api.delete(`/api/resumes/${id}`);
}

export async function setPrimaryResume(id: string): Promise<Resume> {
  const { data } = await api.post(`/api/resumes/${id}/set-primary`);
  return data;
}

export async function rewriteField(id: string, field: string, value: string, context?: string): Promise<{ field: string; improved_value: string }> {
  const { data } = await api.post(`/api/resumes/${id}/rewrite`, { field, value, context });
  return data;
}

export async function reanalyzeResume(id: string): Promise<Resume> {
  const { data } = await api.post(`/api/resumes/${id}/reanalyze`);
  return data;
}

export async function exportResumePdf(id: string, mode: 'resume' | 'cv' = 'cv'): Promise<void> {
  const response = await api.get(`/api/resumes/${id}/export-pdf?mode=${mode}`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  const disposition = response.headers['content-disposition'];
  const filename = disposition ? disposition.split('filename=')[1]?.replace(/"/g, '') : `${mode}.pdf`;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Notifications API
export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  scholarship_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationResponse {
  items: Notification[];
  unread_count: number;
}

export async function fetchNotifications(unreadOnly = false): Promise<NotificationResponse> {
  const { data } = await api.get('/api/notifications', { params: { unread_only: unreadOnly } });
  return data;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get('/api/notifications/unread-count');
  return data.unread_count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.put(`/api/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.put('/api/notifications/read-all');
}

export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/api/notifications/${id}`);
}

// ── Agent API ──────────────────────────────────────────────────

export interface AgentContext {
  profile: {
    name: string;
    degree: string | null;
    field: string | null;
    country: string | null;
    target_degree: string | null;
    has_ielts: boolean;
    ielts_score: number | null;
    prior_studies_in_english: boolean;
  };
  resume: {
    has_resume: boolean;
    score: number;
    title: string | null;
  };
  top_matches: Array<{
    id: string;
    name: string;
    slug: string;
    host_country: string;
    provider: string;
    match_score?: number;
    deadline: string | null;
  }>;
  saved_statuses: Record<string, string>;
}

export interface EligibilityResult {
  type: string;
  eligible: boolean;
  match_score: number;
  requirements_met: Array<{ requirement: string; status: string; detail: string }>;
  requirements_missing: Array<{ requirement: string; status: string; detail: string; action: string }>;
  summary: string;
}

export interface ReadinessResult {
  type: string;
  overall_score: number;
  sections: Array<{ name: string; score: number; status: string; feedback: string }>;
  missing_documents: Array<{ name: string; importance: string; description: string }>;
  improvements: Array<{ area: string; suggestion: string; impact: string }>;
  summary: string;
}

export interface RoadmapResult {
  type: string;
  current_eligibility: boolean;
  estimated_months: number;
  milestones: Array<{ month: number; action: string; category: string; completed: boolean }>;
  alternative_scholarships: Array<{ name: string; reason: string }>;
  summary: string;
}

export interface DiscoverResult {
  type: string;
  opportunities: Array<{ name: string; type: string; match_reason: string; estimated_match: number; slug: string }>;
  insights: string;
}

export interface DocumentResult {
  type: string;
  document_type: string;
  content: string;
  notes: string;
  word_count: number;
}

export async function fetchAgentContext(): Promise<AgentContext> {
  const { data } = await api.get('/api/agent/context');
  return data;
}

export async function agentCheckEligibility(scholarshipId: string, sessionId?: string | null): Promise<EligibilityResult> {
  const { data } = await api.post('/api/agent/chat', {
    message: `Check eligibility for scholarship ${scholarshipId}`,
    action: 'eligibility',
    scholarship_id: scholarshipId,
    session_id: sessionId,
  });
  return data;
}

export async function agentAssessReadiness(scholarshipId?: string, sessionId?: string | null): Promise<ReadinessResult> {
  const { data } = await api.post('/api/agent/chat', {
    message: scholarshipId ? `Assess my readiness for scholarship ${scholarshipId}` : 'Assess my application readiness',
    action: 'readiness',
    scholarship_id: scholarshipId,
    session_id: sessionId,
  });
  return data;
}

export async function agentGenerateRoadmap(scholarshipId: string, sessionId?: string | null): Promise<RoadmapResult> {
  const { data } = await api.post('/api/agent/chat', {
    message: `Create a roadmap to become eligible for scholarship ${scholarshipId}`,
    action: 'roadmap',
    scholarship_id: scholarshipId,
    session_id: sessionId,
  });
  return data;
}

export async function agentDiscover(query: string, sessionId?: string | null): Promise<DiscoverResult> {
  const { data } = await api.post('/api/agent/chat', {
    message: query,
    action: 'discover',
    session_id: sessionId,
  });
  return data;
}

export async function agentGenerateDocument(scholarshipId: string, documentType: string, additionalContext?: string, sessionId?: string | null): Promise<DocumentResult> {
  const { data } = await api.post('/api/agent/chat', {
    message: additionalContext || `Generate a ${documentType} for scholarship ${scholarshipId}`,
    action: 'generate',
    scholarship_id: scholarshipId,
    document_type: documentType,
    session_id: sessionId,
  });
  return data;
}

export async function agentChat(message: string, action?: string, scholarshipId?: string, documentType?: string, sessionId?: string | null): Promise<any> {
  const { data } = await api.post('/api/agent/chat', { message, action, scholarship_id: scholarshipId, document_type: documentType, session_id: sessionId });
  return data;
}

// ── Agent Streaming API ─────────────────────────────────────────

export interface AgentStreamEvent {
  event: 'thinking' | 'tool_call' | 'tool_result' | 'token' | 'done' | 'error' | 'session';
  data: any;
}

export interface AgentStreamCallbacks {
  onThinking?: (step: string) => void;
  onToolCall?: (name: string, args: Record<string, any>) => void;
  onToolResult?: (name: string, result: any) => void;
  onToken?: (token: string) => void;
  onDone?: (result: any) => void;
  onError?: (error: string) => void;
  onSession?: (sessionId: string) => void;
}

/**
 * Stream agent response via SSE with tool calling and reasoning chain.
 * Uses fetch + ReadableStream for browser-compatible SSE.
 */
export async function agentChatStream(
  message: string,
  sessionId: string | null,
  callbacks: AgentStreamCallbacks,
  options: { action?: string; scholarshipId?: string; documentType?: string } = {},
): Promise<void> {
  const response = await fetch(`${API_URL}/api/agent/chat/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      action: options.action || 'chat',
      scholarship_id: options.scholarshipId,
      document_type: options.documentType,
    }),
  });

  if (!response.ok) {
    callbacks.onError?.(`HTTP ${response.status}: ${response.statusText}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError?.('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          // Empty line = end of event
          try {
            const parsed = JSON.parse(currentData);
            switch (currentEvent) {
              case 'thinking':
                callbacks.onThinking?.(parsed);
                break;
              case 'tool_call':
                callbacks.onToolCall?.(parsed.name, parsed.arguments);
                break;
              case 'tool_result':
                callbacks.onToolResult?.(parsed.name, parsed.result);
                break;
              case 'token':
                callbacks.onToken?.(parsed);
                break;
              case 'done':
                callbacks.onDone?.(parsed);
                break;
              case 'error':
                callbacks.onError?.(typeof parsed === 'string' ? parsed : parsed.error || JSON.stringify(parsed));
                break;
              case 'session':
                callbacks.onSession?.(parsed.session_id);
                break;
            }
          } catch {
            // Not JSON, pass raw
            if (currentEvent === 'token') {
              callbacks.onToken?.(currentData);
            }
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Fetch agent sessions list.
 */
export async function fetchAgentSessions(): Promise<Array<{
  id: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string | null;
}>> {
  const { data } = await api.get('/api/agent/sessions');
  return data;
}
