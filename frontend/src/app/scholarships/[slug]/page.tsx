import type { Metadata } from 'next';
import ScholarshipDetailClient from './ScholarshipDetailClient';

const SITE_URL = 'https://scholarshipright.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ScholarshipData {
  id: string;
  name: string;
  slug: string;
  host_country: string;
  host_institution?: string;
  provider?: string;
  degree_levels: string[];
  fields_of_study: string[];
  funding_type: string;
  deadline: string;
  description?: string;
  benefits_summary?: string;
  official_url: string;
  logo_url?: string;
  eligible_nationalities?: string[];
  requires_ielts?: boolean;
  monthly_stipend_usd?: number;
  covers_tuition?: boolean;
  covers_living?: boolean;
  covers_flight?: boolean;
}

async function getScholarship(slug: string): Promise<ScholarshipData | null> {
  try {
    const res = await fetch(`${API_URL}/api/scholarships/${slug}`, {
      next: { revalidate: 3600 }, // revalidate every hour
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const scholarship = await getScholarship(slug);

  if (!scholarship) {
    return {
      title: 'Scholarship Not Found',
      description: 'This scholarship page could not be found.',
    };
  }

  const title = scholarship.name;
  const degreeLabel = scholarship.degree_levels?.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ') || '';
  const fieldLabel = scholarship.fields_of_study?.map(f => f.replace(/_/g, ' ')).join(', ') || '';
  const deadlineStr = scholarship.deadline
    ? new Date(scholarship.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Open';

  const description = `${scholarship.name} — ${degreeLabel} scholarship in ${scholarship.host_country}. ${fieldLabel ? `Fields: ${fieldLabel}. ` : ''}Deadline: ${deadlineStr}. ${scholarship.funding_type === 'fully_funded' ? 'Fully funded.' : ''} Apply now on ScholarshipRight.`;

  const url = `${SITE_URL}/scholarships/${scholarship.slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: 'ScholarshipRight',
      type: 'website',
      images: scholarship.logo_url
        ? [{ url: scholarship.logo_url, width: 200, height: 200, alt: scholarship.name }]
        : [{ url: '/og-default.png', width: 1200, height: 630, alt: scholarship.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function ScholarshipDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const scholarship = await getScholarship(slug);

  // JSON-LD structured data for rich results
  const jsonLd = scholarship
    ? {
        '@context': 'https://schema.org',
        '@type': 'ScholarshipOrEducationalProgram',
        name: scholarship.name,
        description: scholarship.description || scholarship.name,
        url: `${SITE_URL}/scholarships/${scholarship.slug}`,
        provider: {
          '@type': 'Organization',
          name: scholarship.provider || scholarship.host_institution || 'Unknown',
        },
        programType: scholarship.degree_levels?.join(', ') || 'Scholarship',
        educationalLevel: scholarship.degree_levels?.[0] || 'graduate',
        occupationalCategory: scholarship.fields_of_study?.join(', ') || '',
        datePublished: new Date().toISOString(),
        validFrom: scholarship.deadline || undefined,
        applicationDeadline: scholarship.deadline || undefined,
        funding: {
          '@type': 'MonetaryAmount',
          currency: 'USD',
          value: scholarship.monthly_stipend_usd || 0,
        },
        offers: scholarship.covers_tuition
          ? {
              '@type': 'Offer',
              description: 'Fully funded scholarship covering tuition, living expenses, and more.',
              price: 0,
              priceCurrency: 'USD',
            }
          : undefined,
        image: scholarship.logo_url || `${SITE_URL}/og-default.png`,
        areaServed: scholarship.host_country,
        eligibleRegion: scholarship.eligible_nationalities?.map(n => ({ '@type': 'Country', name: n })) || [],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
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
              {
                '@type': 'ListItem',
                position: 3,
                name: scholarship?.name || 'Scholarship',
                item: `${SITE_URL}/scholarships/${slug}`,
              },
            ],
          }),
        }}
      />
      <ScholarshipDetailClient />
    </>
  );
}
