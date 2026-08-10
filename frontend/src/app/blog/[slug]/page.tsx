import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { API_URL, SITE_URL } from '@/lib/env';
import BlogDetailContent from './BlogDetailContent';
import type { BlogPostOut } from '@/lib/blog/types';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  try {
    const res = await fetch(`${API_URL}/api/blog?limit=100`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((p: { slug: string }) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

// React.cache() deduplicates within a single SSR pass —
// generateMetadata() and BlogPostPage() share the same fetch call.
const fetchPost = cache(async (slug: string): Promise<BlogPostOut | null> => {
  try {
    const res = await fetch(`${API_URL}/api/blog/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error('[BlogDetail] Failed to fetch post:', err);
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPost(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
      description: 'The blog post you are looking for could not be found.',
      robots: { index: false, follow: true },
    };
  }

  const title = post.title;
  const description =
    post.excerpt ||
    `${post.title} — scholarship tips, guides, and application advice for international students.`;
  const url = `${SITE_URL}/blog/${slug}`;
  const ogImage = post.cover_image_url || '/og-default.png';

  return {
    title: title,
    description,
    keywords: post.tags.length > 0 ? post.tags : undefined,
    authors: [{ name: post.author_name || 'ScholarshipRight' }],
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      publishedTime: post.published_at || undefined,
      modifiedTime: post.updated_at,
      authors: [post.author_name || 'ScholarshipRight'],
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      siteName: 'ScholarshipRight',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    alternates: {
      canonical: url,
      types: {
        'application/rss+xml': `${SITE_URL}/blog/feed`,
      },
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await fetchPost(slug);

  if (!post) {
    notFound();
  }

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
              { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
              { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/blog/${slug}` },
            ],
          }),
        }}
      />
      <BlogDetailContent post={post} />
    </>
  );
}
