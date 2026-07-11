import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/env';
import { API_URL } from '@/lib/env';
import ScholarshipsListClient from './ScholarshipsListClient';
import type { ScholarshipListResponse } from '@/services/api';

export const metadata: Metadata = {
  title: 'Browse Fully Funded Scholarships',
  description:
    'Discover fully funded international scholarships for bachelor, master, and PhD programs. Filter by country, field, degree level, and funding type. AI-matched to your profile.',
  keywords: [
    'fully funded scholarships', 'international scholarships', 'scholarship finder',
    'browse scholarships', 'scholarship search', 'AI scholarship matching',
    'bachelor scholarships', 'master scholarships', 'PhD scholarships',
    'study abroad scholarships', 'free scholarships', 'scholarship list',
  ],
  openGraph: {
    title: 'Browse Fully Funded Scholarships — ScholarshipRight',
    description: 'Discover fully funded international scholarships matched to your profile.',
    url: `${SITE_URL}/scholarships`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browse Fully Funded Scholarships — ScholarshipRight',
    description: 'Discover fully funded international scholarships matched to your profile.',
  },
  alternates: {
    canonical: `${SITE_URL}/scholarships`,
  },
};

async function fetchInitialScholarships(): Promise<ScholarshipListResponse> {
  const empty: ScholarshipListResponse = { items: [], total: 0, page: 1, limit: 50, pages: 1, profile_status: 'anonymous' };
  try {
    const res = await fetch(`${API_URL}/api/scholarships?limit=50&page=1`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return empty;
    return res.json();
  } catch {
    return empty;
  }
}

export default async function ScholarshipsPage() {
  const initialScholarships = await fetchInitialScholarships();

  // ItemList structured data for Google rich results
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Fully Funded International Scholarships',
    description: 'AI-curated list of fully funded scholarships for bachelor, master, and PhD programs worldwide.',
    numberOfItems: initialScholarships.total,
    itemListElement: initialScholarships.items.slice(0, 20).map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/scholarships/${s.slug}`,
      name: s.name,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense fallback={null}>
        <ScholarshipsListClient initialScholarships={initialScholarships} />
      </Suspense>
    </>
  );
}
