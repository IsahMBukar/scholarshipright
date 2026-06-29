import type { Metadata } from 'next';
import ScholarshipsListClient from './ScholarshipsListClient';

const SITE_URL = 'https://scholarshipright.com';

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

export default function ScholarshipsPage() {
  return <ScholarshipsListClient />;
}
