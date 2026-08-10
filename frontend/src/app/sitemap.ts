import type { MetadataRoute } from 'next';
import { ALL_CATEGORY_SLUGS } from '@/lib/scholarship-categories';
import { API_URL, SITE_URL as BASE_URL } from '@/lib/env';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fixed date for static pages that rarely change.
  // Update this when you make a significant change to static page content.
  const staticLastmod = new Date('2026-08-01');

  // Static pages (noindex pages like /login, /signup are excluded)
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: staticLastmod, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/scholarships`, lastModified: staticLastmod, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/blog`, lastModified: staticLastmod, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/contact`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/faq`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/how-it-works`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/features`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/features/ai-matching`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features/resume-builder`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features/application-tracking`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features/ai-coach`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features/interview-prep`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/privacy`, lastModified: staticLastmod, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: staticLastmod, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Scholarship category pages
  const categoryPages: MetadataRoute.Sitemap = ALL_CATEGORY_SLUGS.map((slug) => ({
    url: `${BASE_URL}/scholarships/category/${slug}`,
    lastModified: staticLastmod,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // Dynamic scholarship detail pages
  let scholarshipPages: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_URL}/api/scholarships?limit=500`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      scholarshipPages = items.map((s: { slug: string; updated_at?: string }) => ({
        url: `${BASE_URL}/scholarships/${s.slug}`,
        lastModified: s.updated_at ? new Date(s.updated_at) : staticLastmod,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
    }
  } catch (e) {
    console.error('Sitemap: failed to fetch scholarships', e);
  }

  // Dynamic blog post pages
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_URL}/api/blog?limit=500`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      blogPages = items.map((p: { slug: string; published_at?: string }) => ({
        url: `${BASE_URL}/blog/${p.slug}`,
        lastModified: p.published_at ? new Date(p.published_at) : staticLastmod,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }));
    }
  } catch (e) {
    console.error('Sitemap: failed to fetch blog posts', e);
  }

  return [...staticPages, ...categoryPages, ...scholarshipPages, ...blogPages];
}
