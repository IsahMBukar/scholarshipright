import type { MetadataRoute } from 'next';
import { ALL_CATEGORY_SLUGS } from '@/lib/scholarship-categories';
import { API_URL, SITE_URL as BASE_URL } from '@/lib/env';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/scholarships`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/features`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/features/ai-matching`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features/resume-builder`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features/application-tracking`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features/ai-coach`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/features/interview-prep`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
  ];

  // Scholarship category pages
  const categoryPages: MetadataRoute.Sitemap = ALL_CATEGORY_SLUGS.map((slug) => ({
    url: `${BASE_URL}/scholarships/category/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  // Dynamic scholarship detail pages
  let scholarshipPages: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_URL}/api/scholarships?limit=500`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      scholarshipPages = items.map((s: { slug: string; updated_at?: string }) => ({
        url: `${BASE_URL}/scholarships/${s.slug}`,
        lastModified: s.updated_at ? new Date(s.updated_at) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
    }
  } catch (e) {
    // If API is unreachable, just return static + category pages
    console.error('Sitemap: failed to fetch scholarships', e);
  }

  return [...staticPages, ...categoryPages, ...scholarshipPages];
}
