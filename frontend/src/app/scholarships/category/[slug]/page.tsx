import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORY_BY_SLUG, ALL_CATEGORY_SLUGS } from '@/lib/scholarship-categories';
import type { Scholarship, ScholarshipListResponse } from '@/services/api';
import CategoryContent from './CategoryContent';

import { API_URL, SITE_URL } from '@/lib/env';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return ALL_CATEGORY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const cat = CATEGORY_BY_SLUG[slug];
  if (!cat) return {};

  return {
    title: cat.title,
    description: cat.description,
    openGraph: {
      title: cat.title,
      description: cat.description,
      type: 'website',
      siteName: 'ScholarshipRight',
    },
    alternates: {
      canonical: `${SITE_URL}/scholarships/category/${slug}`,
    },
  };
}

async function getScholarships(params: Record<string, string>): Promise<Scholarship[]> {
  try {
    const qs = new URLSearchParams({ ...params, limit: '50' });
    const res = await fetch(`${API_URL}/api/scholarships?${qs}`, {
      next: { revalidate: 3600 }, // ISR: revalidate every hour
    });
    if (!res.ok) return [];
    const data: ScholarshipListResponse = await res.json();
    return data.items || [];
  } catch (err) {
    console.error('[CategoryPage] Failed to fetch scholarships:', err);
    return [];
  }
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const cat = CATEGORY_BY_SLUG[slug];
  if (!cat) notFound();

  const scholarships = await getScholarships(cat.params);

  return (
    <>
      {/* Breadcrumb structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
              { '@type': 'ListItem', position: 2, name: 'Scholarships', item: `${SITE_URL}/scholarships` },
              { '@type': 'ListItem', position: 3, name: cat.title, item: `${SITE_URL}/scholarships/category/${slug}` },
            ],
          }),
        }}
      />
      <CategoryContent category={cat} scholarships={scholarships} />
    </>
  );
}
