import { NextResponse } from 'next/server';
import { API_URL, SITE_URL } from '@/lib/env';

interface BlogItem {
  slug: string;
  title: string;
  excerpt?: string | null;
  author_name?: string | null;
  published_at?: string | null;
  cover_image_url?: string | null;
  tags?: string[];
}

export async function GET() {
  let posts: BlogItem[] = [];

  try {
    const res = await fetch(`${API_URL}/api/blog?limit=50`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      posts = data.items || [];
    }
  } catch (err) {
    console.error('[BlogFeed] Failed to fetch blog posts for RSS feed:', err);
  }

  const items = posts
    .map(
      (p) => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>
      <description><![CDATA[${p.excerpt || ''}]]></description>
      <pubDate>${p.published_at ? new Date(p.published_at).toUTCString() : ''}</pubDate>
      <author>${p.author_name || 'ScholarshipRight'}</author>
      ${p.cover_image_url ? `<enclosure url="${p.cover_image_url}" type="image/jpeg" />` : ''}
      ${(p.tags || []).map((t) => `<category>${t}</category>`).join('\n      ')}
    </item>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ScholarshipRight Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Guides, tips, and stories to help you win fully funded scholarships.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/blog/feed" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/og-default.png</url>
      <title>ScholarshipRight</title>
      <link>${SITE_URL}</link>
    </image>${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
