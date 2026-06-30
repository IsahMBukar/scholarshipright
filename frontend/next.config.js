/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  // NOTE on the previous /api/:path* rewrite:
  // It hardcoded http://localhost:8000, which would silently break any
  // deployment that wasn't the dev box. We removed it and instead rely on
  // `NEXT_PUBLIC_API_URL` (the constant `API_URL` in src/services/api.ts
  // and its mirrors in the auth pages). The browser will call the backend
  // directly. CORS is already configured on the backend (see
  // backend/app/main.py -> CORSMiddleware.allow_origins) to accept the
  // frontend's origin in any environment, as long as FRONTEND_URL is
  // set correctly in the backend .env.

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Scholarship provider logos may come from arbitrary HTTPS hosts.
      // Tighten this list as known CDNs/hosts are identified in prod.
      { protocol: 'https', hostname: '**' },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // X-Frame-Options: prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // X-Content-Type-Options: prevent MIME-type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Referrer-Policy: limit referrer information leakage
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permissions-Policy: restrict browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Content-Security-Policy (report-only mode initially)
          // Adjust as needed, then switch to enforcing by removing '-Report-Only'
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline/eval for dev
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "connect-src 'self' https:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
