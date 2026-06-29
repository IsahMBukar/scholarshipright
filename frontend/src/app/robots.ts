import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://scholarshipright.com';

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
