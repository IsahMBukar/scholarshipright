import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/env';
import { API_URL } from '@/lib/env';
import BlogListContent from './BlogListContent';
import type { PaginatedBlogs } from '@/lib/blog/types';

export const metadata: Metadata = {
  title: 'Blog — ScholarshipRight',
  description:
    'Guides, tips, and stories to help you win fully funded scholarships. Expert advice on applications, essays, and finding the right match.',
  keywords: ['scholarship blog', 'scholarship guide', 'scholarship tips', 'scholarship application guide', 'study abroad tips', 'scholarship essay tips', 'fully funded scholarship guide'],
  openGraph: {
    title: 'Blog — ScholarshipRight',
    description: 'Guides, tips, and stories to help you win fully funded scholarships.',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
  alternates: {
    canonical: `${SITE_URL}/blog`,
    types: {
      'application/rss+xml': `${SITE_URL}/blog/feed`,
    },
  },
};

async function fetchInitialPosts(): Promise<{ posts: PaginatedBlogs; categories: string[] }> {
  try {
    const [postsRes, catRes] = await Promise.all([
      fetch(`${API_URL}/api/blog?page=1&limit=12`, { next: { revalidate: 60 } }),
      fetch(`${API_URL}/api/blog/categories`, { next: { revalidate: 300 } }),
    ]);
    const posts = postsRes.ok ? await postsRes.json() : { items: [], page: 1, pages: 1, total: 0 };
    const categories = catRes.ok ? await catRes.json() : [];
    return { posts, categories };
  } catch (err) {
    console.error('[BlogPage] Failed to fetch initial posts:', err);
    return { posts: { items: [], page: 1, pages: 1, total: 0 }, categories: [] };
  }
}

export default async function BlogPage() {
  const { posts, categories } = await fetchInitialPosts();
  return <BlogListContent initialPosts={posts} initialCategories={categories} />;
}
