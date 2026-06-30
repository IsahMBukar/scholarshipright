/**
 * Centralised public env access.
 *
 * Every browser-facing module imports `API_URL` (and `SITE_URL`) from here.
 * In production (`NEXT_PUBLIC_API_URL` unset), the build will throw at module
 * load — preventing the previous footgun where a missed file silently called
 * `http://localhost:8000` from a deployed browser.
 *
 * In development the localhost fallback is allowed so `npm run dev`
 * works out of the box without an .env file.
 */

const RAW = process.env.NEXT_PUBLIC_API_URL;

function resolveApiUrl(): string {
  if (RAW && RAW.length > 0) {
    // Strip a single trailing slash so callers can safely concatenate
    // `${API_URL}/api/...` without producing `//api/...`.
    return RAW.replace(/\/+$/, '');
  }
  // Dev fallback only. In production builds, refuse to start with no
  // configured backend — a localhost URL in the browser is always wrong.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_API_URL is required in production builds. ' +
        'Set it to your publicly reachable backend URL (no trailing slash, no /api suffix).',
    );
  }
  return 'http://localhost:8000';
}

export const API_URL = resolveApiUrl();

/**
 * Public site URL (canonical origin) used for sitemap.xml, robots.txt,
 * canonical metadata, and absolute share links. Defaults to the production
 * domain so a missing env var doesn't break SEO output in CI/preview builds.
 * Trailing slash is stripped for safe concatenation.
 */
function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (raw && raw.length > 0) {
    return raw.replace(/\/+$/, '');
  }
  return 'https://scholarshipright.com';
}

export const SITE_URL = resolveSiteUrl();
