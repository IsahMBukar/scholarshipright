import type { Metadata } from 'next';
import BlogListContent from './BlogListContent';

const SITE_URL = 'https://scholarshipright.com';

export const metadata: Metadata = {
  title: 'Blog — ScholarshipRight',
  description:
    'Guides, tips, and stories to help you win fully funded scholarships. Expert advice on applications, essays, and finding the right match.',
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

export default function BlogPage() {
  return <BlogListContent />;
}
