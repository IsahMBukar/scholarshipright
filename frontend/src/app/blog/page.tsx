import type { Metadata } from 'next';
import BlogListContent from './BlogListContent';

export const metadata: Metadata = {
  title: 'Blog — ScholarshipRight',
  description:
    'Guides, tips, and stories to help you win fully funded scholarships. Expert advice on applications, essays, and finding the right match.',
  openGraph: {
    title: 'Blog — ScholarshipRight',
    description: 'Guides, tips, and stories to help you win fully funded scholarships.',
    type: 'website',
  },
};

export default function BlogPage() {
  return <BlogListContent />;
}
