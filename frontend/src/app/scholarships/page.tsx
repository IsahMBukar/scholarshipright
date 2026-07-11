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
  try {
    const res = await fetch(`${API_URL}/api/scholarships?limit=50&page=1`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { items: [], total: 0, page: 1, limit: 50, pages: 1 };
    return res.json();
  } catch {
    return { items: [], total: 0, page: 1, limit: 50, pages: 1 };
  }
}

export default async function ScholarshipsPage() {
  const initialScholarships = await fetchInitialScholarships();
  return (
    <Suspense fallback={null}>
      <ScholarshipsListClient initialScholarships={initialScholarships} />
    </Suspense>
  );
}
