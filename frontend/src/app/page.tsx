import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/env';
import LandingClient from './LandingClient';



export const metadata: Metadata = {
  title: 'ScholarshipRight — Find Fully Funded Scholarships with AI',
  description:
    'Get matched to fully funded international scholarships in 30 seconds. AI-powered matching, 100+ awards across 18+ countries. Free to use — no credit card required.',
  openGraph: {
    title: 'ScholarshipRight — Find Fully Funded Scholarships with AI',
    description:
      'Get matched to fully funded international scholarships in 30 seconds. AI-powered matching, 100+ awards across 18+ countries.',
    url: SITE_URL,
    type: 'website',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'ScholarshipRight' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ScholarshipRight — Find Fully Funded Scholarships with AI',
    description:
      'Get matched to fully funded international scholarships in 30 seconds. AI-powered matching, 100+ awards across 18+ countries.',
    images: ['/og-default.png'],
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function LandingPage() {
  // WebSite structured data for sitelinks search box
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ScholarshipRight',
    url: SITE_URL,
    description: 'AI-powered scholarship discovery platform. Find fully funded international scholarships matched to your profile.',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/scholarships?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <LandingClient />
    </>
  );
}
