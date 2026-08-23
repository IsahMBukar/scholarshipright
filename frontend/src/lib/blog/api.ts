/**
 * Blog API client — public endpoints + authenticated write operations.
 */

import { API_URL } from '@/lib/env';
import type {
  BlogPostOut,
  BlogListOut,
  PaginatedBlogs,
  BlogCreatePayload,
  BlogUpdatePayload,
} from './types';

export type { BlogPostOut, BlogListOut, PaginatedBlogs };

// ── Public endpoints ─────────────────────────────────────────────

export async function fetchBlogPosts(params?: {
  page?: number;
  limit?: number;
  category?: string;
  tag?: string;
}): Promise<PaginatedBlogs> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.category) qs.set('category', params.category);
  if (params?.tag) qs.set('tag', params.tag);

  const sep = qs.toString() ? `?${qs}` : '';
  const res = await fetch(`${API_URL}/api/blog${sep}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch blog posts: ${res.status}`);
  return res.json();
}

export async function fetchBlogPost(slug: string): Promise<BlogPostOut> {
  const res = await fetch(`${API_URL}/api/blog/${slug}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Post not found: ${res.status}`);
  return res.json();
}

export async function fetchBlogCategories(): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/blog/categories`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

// ── Authenticated endpoints ──────────────────────────────────────

function throwApiError(err: any, fallback: string): never {
  const detail = err?.detail;
  if (detail && typeof detail === 'object' && detail.code === 'scholarship_tag_invalid') {
    const e: any = new Error(detail.message || `Invalid slugs: ${(detail.invalid_slugs || []).join(', ')}`);
    e.code = detail.code;
    e.invalid_slugs = detail.invalid_slugs;
    e.suggestions = detail.suggestions;
    e.detail = detail;
    throw e;
  }
  const msg = typeof detail === 'string' ? detail : detail?.message || detail?.detail || fallback;
  throw new Error(msg);
}

export async function createBlogPost(
  payload: BlogCreatePayload,
): Promise<BlogPostOut> {
  const res = await fetch(`${API_URL}/api/blog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throwApiError(err, `Create failed: ${res.status}`);
  }
  return res.json();
}

export async function updateBlogPost(
  postId: string,
  payload: BlogUpdatePayload,
): Promise<BlogPostOut> {
  const res = await fetch(`${API_URL}/api/blog/${postId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throwApiError(err, `Update failed: ${res.status}`);
  }
  return res.json();
}

export async function validateScholarshipSlugs(slugs: string[]): Promise<{ valid: string[]; invalid: { slug: string; suggestions: { slug: string; name: string; host_country?: string }[] }[] }> {
  const res = await fetch(`${API_URL}/api/scholarships/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ slugs }),
  });
  if (!res.ok) throw new Error(`Validate failed: ${res.status}`);
  return res.json();
}

export async function deleteBlogPost(postId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/blog/${postId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

// ── Admin endpoints ──────────────────────────────────────────────

export async function adminFetchAllPosts(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedBlogs> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);

  const sep = qs.toString() ? `?${qs}` : '';
  const res = await fetch(`${API_URL}/api/blog/admin/all${sep}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Admin fetch failed: ${res.status}`);
  return res.json();
}

export async function adminFetchPost(postId: string): Promise<BlogPostOut> {
  const res = await fetch(`${API_URL}/api/blog/admin/${postId}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Post not found: ${res.status}`);
  return res.json();
}
