import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORY_BY_SLUG, ALL_CATEGORY_SLUGS } from '@/lib/scholarship-categories';
import type { Scholarship, ScholarshipListResponse } from '@/services/api';
import CategoryContent from './CategoryContent';

import { API_URL } from '@/lib/env';

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
  } catch {
    return [];
  }
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const cat = CATEGORY_BY_SLUG[slug];
  if (!cat) notFound();

  const scholarships = await getScholarships(cat.params);

  return <CategoryContent category={cat} scholarships={scholarships} />;
}
