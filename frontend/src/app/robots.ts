import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_URL;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/settings', '/profile', '/resume', '/chat', '/onboarding'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
