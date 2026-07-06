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
    throw new Error(err.detail || `Create failed: ${res.status}`);
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
    throw new Error(err.detail || `Update failed: ${res.status}`);
  }
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
