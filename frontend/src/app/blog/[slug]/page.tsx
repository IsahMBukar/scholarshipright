import type { Metadata } from 'next';
import BlogDetailContent from './BlogDetailContent';

const SITE_URL = 'https://scholarshipright.com';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Blog Post — ScholarshipRight`,
    description: 'Read this scholarship guide on ScholarshipRight.',
    openGraph: {
      title: `Blog Post — ScholarshipRight`,
      description: 'Scholarship guide from ScholarshipRight.',
      url: `${SITE_URL}/blog/${slug}`,
      type: 'article',
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  return <BlogDetailContent slug={slug} />;
}
