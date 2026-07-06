/**
 * Blog API types and client functions.
 */

export interface ScholarshipTagOut {
  scholarship_id: string;
  slug: string;
  name: string;
  host_country: string;
  provider?: string | null;
  deadline?: string | null;
  funding_type?: string | null;
  degree_levels: string[];
  position_hint: number;
}

export interface BlogPostOut {
  id: string;
  author_id: string;
  author_name?: string | null;
  title: string;
  slug: string;
  excerpt?: string | null;
  body: string;
  html_body: string;
  cover_image_url?: string | null;
  category: string;
  tags: string[];
  reading_time_minutes: number;
  view_count: number;
  status: string;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  scholarship_tags: ScholarshipTagOut[];
}

export interface BlogListOut {
  id: string;
  author_name?: string | null;
  title: string;
  slug: string;
  excerpt?: string | null;
  cover_image_url?: string | null;
  category: string;
  tags: string[];
  reading_time_minutes: number;
  view_count: number;
  published_at?: string | null;
}

export interface PaginatedBlogs {
  items: BlogListOut[];
  total: number;
  page: number;
  pages: number;
}

export interface BlogCreatePayload {
  title: string;
  excerpt?: string;
  body: string;
  cover_image_url?: string;
  category?: string;
  tags?: string[];
  status?: 'draft' | 'published' | 'pending_review';
}

export interface BlogUpdatePayload {
  title?: string;
  excerpt?: string;
  body?: string;
  cover_image_url?: string;
  category?: string;
  tags?: string[];
  status?: string;
}
