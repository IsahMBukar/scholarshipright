'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Types
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
  match_score?: number;
  match_breakdown?: Record<string, number>;
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
  publications: string[];
  research_interests: string[];
  certifications: string[];
  work_experience_years?: number;
  target_degree?: string;
  target_fields: string[];
  target_start_date?: string;
  target_countries: string[];
  has_ielts: boolean;
  ielts_score?: number;
  languages: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

// API client
const api = axios.create({ baseURL: API_URL, withCredentials: true });

// Scholarships API
export async function fetchScholarships(params: Record<string, string> = {}): Promise<ScholarshipListResponse> {
  const { data } = await api.get('/api/scholarships', { params });
  return data;
}

export async function fetchScholarship(slug: string): Promise<Scholarship> {
  const { data } = await api.get(`/api/scholarships/${slug}`);
  return data;
}

export async function fetchFeaturedScholarships(): Promise<Scholarship[]> {
  const { data } = await api.get('/api/scholarships/featured');
  return data;
}

// Profile API
export async function fetchProfile(): Promise<Profile> {
  const { data } = await api.get('/api/profile');
  return data;
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

export async function computeMatches(): Promise<{ status: string }> {
  const { data } = await api.post('/api/matches/compute');
  return data;
}

// Saved Scholarships API
export async function fetchSavedScholarships(): Promise<Array<Scholarship & { status: string; notes?: string; reminder_enabled: boolean }>> {
  const { data } = await api.get('/api/saved');
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

// Chat API
export async function fetchChatSessions(): Promise<ChatSession[]> {
  const { data } = await api.get('/api/chat/sessions');
  return data;
}

export async function createChatSession(): Promise<ChatSession> {
  const { data } = await api.post('/api/chat/sessions');
  return data;
}

export async function sendMessage(sessionId: string, message: string): Promise<{ reply: string }> {
  const { data } = await api.post(`/api/chat/sessions/${sessionId}/message`, { message });
  return data;
}

// Resume API
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
