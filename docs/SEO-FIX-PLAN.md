# ScholarshipRight — SEO Fix Plan (Code-Grounded TODO)

> Last verified against source: 2026-08-10
> Data source: Google Search Console export (Jun 30 – Aug 6, 2026)
> Search Console zip: `~/Downloads/scholarshipright-search-console-data/`

---

## A. Executive Summary

| Metric | Value (Jun 30 – Aug 6) |
|---|---|
| Total clicks | 23 |
| Total impressions | 1,279 |
| Avg CTR | 1.8% |
| Avg position | ~24 |
| Indexed pages | 144 |
| Not indexed | 29 |
| External backlinks | 0 |

**Top-line problems:**
1. 11% of Googlebot crawl budget wasted on 401s (hitting /api/ and /auth/ endpoints).
2. 9 of 14 scholarship category pages never crawled — stuck in "Discovered, not indexed".
3. SearchAction JSON-LD leaks a literal placeholder URL into Google's index.
4. All page titles append "— ScholarshipRight" (brand dilution in SERPs).
5. Zero external backlinks; individual content pages have only 1 internal link each.

**Expected impact if all fixes applied:**

| Metric | Current | Target |
|---|---|---|
| Indexed pages | 144 | 200+ |
| Impressions/day | ~199 | 500–800 |
| CTR | 1.8% | 5–8% |
| Avg position | ~24 | 15–20 |

---

## B. Verified Issue Register

| ID | Severity | Affected file(s) | Status | GSC Evidence |
|---|---|---|---|---|
| I01 | CRITICAL | `src/app/robots.ts` | NOT FIXED | 11.33% of crawl = 401 Unauthorized; Googlebot hitting /api/* and /auth/ |
| I02 | CRITICAL | `src/app/page.tsx` L39–50 | NOT FIXED | Coverage: "Alternate page with proper canonical" for /scholarships?q=%7Bsearch_term_string%7D |
| I03 | CRITICAL | `src/app/sitemap.ts` L25–26, L40, L58 | NOT FIXED | /login + /signup in sitemap but noindex; cache:'no-store' can time out |
| I04 | CRITICAL | 9 category pages | NOT FIXED | "Discovered – currently not indexed", lastmod 1970-01-01 |
| I05 | HIGH | `frontend/src/app/layout.tsx` L17 | NOT FIXED | All titles end "— ScholarshipRight" |
| I06 | HIGH | `src/lib/scholarship-categories.ts` L19,28,36,49,59,68,81,99,108,116,126,136,144 | NOT FIXED | 14 category titles hardcode "— ScholarshipRight" |
| I07 | HIGH | `src/app/blog/[slug]/page.tsx` L43 | NOT FIXED | Blog title hardcodes "— ScholarshipRight" |
| I08 | HIGH | `src/app/scholarships/[slug]/page.tsx` L61 | NOT FIXED | Meta description is a data dump, not click-worthy |
| I09 | HIGH | `src/app/blog/[slug]/BlogDetailContent.tsx` | NOT FIXED | No BreadcrumbList JSON-LD; GSC shows only 8 breadcrumb items total |
| I10 | HIGH | `src/app/scholarships/category/[slug]/page.tsx` | NOT FIXED | No BreadcrumbList JSON-LD, no canonical URL |
| I11 | MEDIUM | `src/app/scholarships/[slug]/page.tsx` L108 | NOT FIXED | `datePublished: new Date().toISOString()` = "today" every render |
| I12 | MEDIUM | `src/app/blog/[slug]/page.tsx` L14 | NOT FIXED | fetchPost has no revalidate directive (inconsistent with scholarship page's revalidate:3600) |
| I13 | MEDIUM | `src/app/blog/[slug]/page.tsx` | NOT FIXED | No generateStaticParams (pages built on-demand) |
| I14 | MEDIUM | `src/app/scholarships/[slug]/page.tsx` | NOT FIXED | No generateStaticParams (pages built on-demand) |
| I15 | MEDIUM | `src/app/scholarships/page.tsx` | NOT FIXED | No BreadcrumbList JSON-LD |
| I16 | MEDIUM | `src/app/blog/page.tsx` | NOT FIXED | No BreadcrumbList JSON-LD |
| I17 | MEDIUM | `frontend/next.config.js` | NOT FIXED | No redirects() for www→non-www / http→https; GSC redirect FAILED validation |
| I18 | MEDIUM | `src/app/scholarships/category/[slug]/page.tsx` | NOT FIXED | No canonical URL in generateMetadata |
| I19 | LOW | `src/app/blog/feed/route.ts` L18 | NOT FIXED | Uses cache:'no-store' for RSS feed fetch |
| I20 | LOW | `frontend/src/app/layout.tsx` L104–110 | NOT FIXED | Organization sameAs social profiles — verify they exist |
| I21 | LOW | Content/linking | NOT FIXED | Top pages have only 1 internal link each (orphan-ish) |
| I22 | LOW | Off-page | NOT FIXED | Zero external backlinks |

---

## C. The TODO Checklist

### Phase 1 — Crawl Budget & Indexation (CRITICAL)

- [ ] **P1.1** Rewrite `robots.ts` to block /api/, /_next/, /auth/, /admin/ with trailing slashes

  **File:** `frontend/src/app/robots.ts` (line 12)
  **Current:**
  ```ts
  disallow: ['/admin', '/onboarding', '/chat', '/resume', '/profile', '/settings', '/blog/write', '/auth/callback'],
  ```
  **Change to:**
  ```ts
  disallow: [
    '/admin/',
    '/onboarding/',
    '/chat/',
    '/resume/',
    '/profile/',
    '/settings/',
    '/blog/write/',
    '/api/',
    '/_next/',
    '/auth/',
  ],
  ```
  **Why:** Googlebot is hitting /api/* (auth-protected) → 401 Unauthorized = 11.33% wasted crawl. Trailing slashes ensure all sub-paths are blocked.

- [ ] **P1.2** Remove SearchAction potentialAction from `page.tsx`

  **File:** `frontend/src/app/page.tsx` (lines 38–50)
  **Current:**
  ```ts
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ScholarshipRight',
    url: SITE_URL,
    description: '...',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/scholarships?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
  ```
  **Change to:** Remove the `potentialAction` property entirely:
  ```ts
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ScholarshipRight',
    url: SITE_URL,
    description: 'AI-powered scholarship discovery platform. Find fully funded international scholarships matched to your profile.',
  };
  ```
  **Why:** Google deprecated sitelinks search box (Nov 2023). The literal `{search_term_string}` placeholder is being crawled as `/scholarships?q=%7Bsearch_term_string%7D` — appears in Coverage as "Alternate page with proper canonical tag". Pure downside, no upside.

- [ ] **P1.3** Fix sitemap: remove /login+/signup, switch to revalidate, use real lastmod

  **File:** `frontend/src/app/sitemap.ts`
  **Changes:**
  1. Remove `/signup` and `/login` from `staticPages` (lines 25–26) — they are noindex pages; including them in the sitemap wastes crawl budget and creates a contradiction.
  2. Replace `const now = new Date();` (line 6) with a fixed date for static pages that rarely change:
     ```ts
     const staticLastmod = new Date('2026-08-01'); // update when static pages change
     ```
  3. Replace `cache: 'no-store'` (lines 40, 58) with `next: { revalidate: 3600 }` to prevent build-time API timeouts:
     ```ts
     const res = await fetch(`${API_URL}/api/scholarships?limit=500`, {
       next: { revalidate: 3600 },
     });
     ```
     ```ts
     const res = await fetch(`${API_URL}/api/blog?limit=500`, {
       next: { revalidate: 3600 },
     });
     ```
  **Why:** /login and /signup are noindex — they shouldn't be in the sitemap. `cache:'no-store'` forces a fresh fetch on every build, which can time out and produce an incomplete sitemap. ISR with revalidate:3600 caches the response for 1 hour, making builds faster and more reliable.

- [ ] **P1.4** Add canonical redirects in `next.config.js`

  **File:** `frontend/next.config.js`
  **Add `redirects()` function** inside `nextConfig` (after `headers()`):
  ```js
  async redirects() {
    return [
      // Redirect www to non-www (canonical)
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.scholarshipright.com' }],
        destination: 'https://scholarshipright.com/:path*',
        permanent: true,
      },
    ];
  },
  ```
  **Note:** For http→https, this is typically handled at the hosting/CDN level (Vercel, Nginx, Cloudflare). Next.js runs after TLS termination, so it can't redirect http→https itself. Verify your hosting config does this. The GSC "Page with redirect" that FAILED validation was `http://scholarshipright.com/` — make sure the server returns 301 to `https://scholarshipright.com/`.

- [ ] **P1.5** Request indexing in GSC for 9 category pages + /features/resume-builder

  After deploying P1.1–P1.4, manually request indexing in Google Search Console for:
  - /scholarships/category/undergraduate
  - /scholarships/category/masters
  - /scholarships/category/phd
  - /scholarships/category/fully-funded
  - /scholarships/category/no-ielts
  - /scholarships/category/no-application-fee
  - /scholarships/category/germany
  - /scholarships/category/united-kingdom
  - /scholarships/category/united-states
  - /features/resume-builder

  **Why:** These 9 category pages are in the sitemap but Google has never crawled them (lastmod 1970-01-01 in Coverage). They're the highest-value landing pages for long-tail queries like "scholarships in Germany". Requesting indexing forces a crawl.

---

### Phase 2 — On-Page Metadata Quality (HIGH)

- [ ] **P2.1** Change title template in `layout.tsx`

  **File:** `frontend/src/app/layout.tsx` (line 17)
  **Current:** `template: '%s — ScholarshipRight'`
  **Change to:** `template: '%s | Scholarships & Study Abroad'`
  **Why:** "— ScholarshipRight" on every page wastes ~20 chars of title space. A keyword-rich suffix improves relevance signals for every page.

- [ ] **P2.2** Strip "— ScholarshipRight" from all 14 category titles

  **File:** `frontend/src/lib/scholarship-categories.ts`
  **Every `title` field** (lines 19, 28, 36, 49, 59, 68, 81, 99, 108, 116, 126, 136, 144) currently appends "— ScholarshipRight". Remove the suffix from all of them. Example:
  - Line 19: `'Undergraduate Scholarships — ScholarshipRight'` → `'Undergraduate Scholarships'`
  - Line 28: `"Master's Scholarships — ScholarshipRight"` → `"Master's Scholarships"`
  - Line 81: `'Scholarships in Germany — ScholarshipRight'` → `'Scholarships in Germany'`
  - (and so on for all 14 entries)

  **Why:** The title template (P2.1) will append the suffix automatically. Hardcoding it causes a double suffix: "Scholarships in Germany — ScholarshipRight | Scholarships & Study Abroad".

- [ ] **P2.3** Strip "— ScholarshipRight" from blog detail title

  **File:** `frontend/src/app/blog/[slug]/page.tsx` (line 43)
  **Current:** `title: \`${title} — ScholarshipRight\``
  **Change to:** `title: title`
  **Why:** Same as P2.2 — the template appends the suffix.

- [ ] **P2.4** Rewrite scholarship detail meta description to be click-worthy

  **File:** `frontend/src/app/scholarships/[slug]/page.tsx` (line 61)
  **Current:**
  ```ts
  const description = `${scholarship.name} — ${degreeLabel} scholarship in ${scholarship.host_country}. ${fieldLabel ? `Fields: ${fieldLabel}. ` : ''}Deadline: ${deadlineStr}. ${scholarship.funding_type === 'fully_funded' ? 'Fully funded.' : ''} Apply now on ScholarshipRight.`;
  ```
  This produces data-dump descriptions like: "Rhodes Scholarship — Graduate scholarship in United Kingdom. Fields: Arts, Humanities. Deadline: October 1, 2026. Fully funded. Apply now on ScholarshipRight."
  **Change to:**
  ```ts
  const parts = [
    `Apply for ${scholarship.name}`,
    degreeLabel ? `(${degreeLabel})` : '',
    `in ${scholarship.host_country}.`,
    scholarship.funding_type === 'fully_funded' ? 'Fully funded —' : '',
    deadlineStr !== 'Open' ? `Deadline: ${deadlineStr}.` : 'Rolling deadline.',
  ].filter(Boolean);
  const description = parts.join(' ').slice(0, 155);
  ```
  **Why:** ≤155 chars, starts with action verb ("Apply for"), includes the degree level and country for relevance, and ends with the deadline for urgency.

- [ ] **P2.5** Improve blog detail description fallback

  **File:** `frontend/src/app/blog/[slug]/page.tsx` (lines 36–38)
  **Current:**
  ```ts
  const description =
    post.excerpt ||
    `Read "${post.title}" on ScholarshipRight — expert scholarship guides and tips.`;
  ```
  **Change to:**
  ```ts
  const description =
    post.excerpt ||
    `${post.title} — scholarship tips, guides, and application advice for international students.`;
  ```
  **Why:** The fallback is generic and brand-heavy. This version is keyword-rich and ≤155 chars.

- [ ] **P2.6** Add canonical URL to category page

  **File:** `frontend/src/app/scholarships/category/[slug]/page.tsx` (lines 17–32)
  **Current `generateMetadata` has no `alternates.canonical`.** Add:
  ```ts
  import { SITE_URL } from '@/lib/env';
  // ... inside generateMetadata return:
  alternates: {
    canonical: `${SITE_URL}/scholarships/category/${slug}`,
  },
  ```
  **Why:** Without a canonical URL, Google may pick a different URL as the canonical (e.g., a filtered scholarships page with query params).

---

### Phase 3 — Structured Data (HIGH)

- [ ] **P3.1** Add BreadcrumbList JSON-LD to blog detail page

  **File:** `frontend/src/app/blog/[slug]/page.tsx` (add in the JSX return, before `<BlogDetailContent />`)
  ```tsx
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
  ```
  **Why:** Search Console confirms only 8 breadcrumb items total (all from scholarship detail pages). Blog pages have zero breadcrumbs.

- [ ] **P3.2** Add BreadcrumbList JSON-LD to category page

  **File:** `frontend/src/app/scholarships/category/[slug]/page.tsx` (add in JSX return, before `<CategoryContent />`)
  ```tsx
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Scholarships', item: `${SITE_URL}/scholarships` },
          { '@type': 'ListItem', position: 3, name: cat.title, item: `${SITE_URL}/scholarships/category/${slug}` },
        ],
      }),
    }}
  />
  ```
  **Note:** The current `page.tsx` returns `<CategoryContent category={cat} scholarships={scholarships} />` directly. You'll need to wrap it in a fragment `<>...</>` to add the script tag.

- [ ] **P3.3** Add BreadcrumbList to scholarships index + blog index pages

  **File:** `frontend/src/app/scholarships/page.tsx` — add after the existing ItemList JSON-LD:
  ```tsx
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Scholarships', item: `${SITE_URL}/scholarships` },
        ],
      }),
    }}
  />
  ```

  **File:** `frontend/src/app/blog/page.tsx` — add in JSX return:
  ```tsx
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
        ],
      }),
    }}
  />
  ```
  **Note:** `blog/page.tsx` currently returns `<BlogListContent .../>` directly — wrap in fragment.

- [ ] **P3.4** Fix `datePublished` in scholarship detail JSON-LD

  **File:** `frontend/src/app/scholarships/[slug]/page.tsx` (line 108)
  **Current:** `datePublished: new Date().toISOString()`
  **Change to:**
  ```ts
  datePublished: scholarship.created_at || scholarship.updated_at || new Date().toISOString(),
  ```
  You'll need to add `created_at` and `updated_at` to the `ScholarshipData` interface (line 7):
  ```ts
  created_at?: string;
  updated_at?: string;
  ```
  **Why:** `new Date().toISOString()` makes every scholarship look like it was "published today", which is misleading and causes Google to re-process the structured data on every crawl.

---

### Phase 4 — Static Generation & ISR (MEDIUM)

- [ ] **P4.1** Add `generateStaticParams` to scholarship detail page

  **File:** `frontend/src/app/scholarships/[slug]/page.tsx` (add before `generateMetadata`)
  ```ts
  export async function generateStaticParams() {
    try {
      const res = await fetch(`${API_URL}/api/scholarships?limit=500`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []).map((s: { slug: string }) => ({ slug: s.slug }));
    } catch {
      return [];
    }
  }
  ```
  **Why:** Without this, scholarship pages are built on-demand (slower first response, no build-time static HTML). Adding it pre-builds all pages at `next build` time.

- [ ] **P4.2** Add `generateStaticParams` to blog detail page

  **File:** `frontend/src/app/blog/[slug]/page.tsx` (add before `generateMetadata`)
  ```ts
  export async function generateStaticParams() {
    try {
      const res = await fetch(`${API_URL}/api/blog?limit=500`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []).map((p: { slug: string }) => ({ slug: p.slug }));
    } catch {
      return [];
    }
  }
  ```

- [ ] **P4.3** Add `revalidate: 3600` to blog detail `fetchPost`

  **File:** `frontend/src/app/blog/[slug]/page.tsx` (line 14)
  **Current:**
  ```ts
  const res = await fetch(`${API_URL}/api/blog/${slug}`);
  ```
  **Change to:**
  ```ts
  const res = await fetch(`${API_URL}/api/blog/${slug}`, {
    next: { revalidate: 3600 },
  });
  ```
  **Why:** The scholarship detail page already uses `revalidate: 3600` (line 33). The blog detail page uses the default (no caching), which means every request hits the API. This inconsistency means blog pages are slower and put more load on the backend.

- [ ] **P4.4** Switch blog RSS feed fetch from `no-store` to `revalidate: 3600`

  **File:** `frontend/src/app/blog/feed/route.ts` (line 18)
  **Current:**
  ```ts
  const res = await fetch(`${API_URL}/api/blog?limit=50`, { cache: 'no-store' });
  ```
  **Change to:**
  ```ts
  const res = await fetch(`${API_URL}/api/blog?limit=50`, {
    next: { revalidate: 3600 },
  });
  ```
  **Why:** RSS feeds don't need real-time data. ISR with 1-hour revalidation is sufficient and reduces backend load.

---

### Phase 5 — Content & Internal Linking (MEDIUM)

- [ ] **P5.1** Boost CTR on top page (deadlines blog post)

  **Page:** `/blog/scholarship-deadlines-to-watch-julyaugust-2026`
  **Current:** 114 impressions, 1 click (0.88% CTR), position 5.2
  **Action:** Rewrite the title and meta description to be more click-worthy. Current title likely too generic. Suggested:
  - Title: "Scholarship Deadlines July & August 2026 — Don't Miss These"
  - Description: "15+ fully funded scholarship deadlines closing in July & August 2026. DAAD, Chevening, MEXT, and more. Apply before it's too late."
  **Why:** This page is on page 1 (position 5.2) but getting almost no clicks. A better title/description can 5-10x the CTR.

- [ ] **P5.2** Improve rhodes-scholarship page content depth

  **Page:** `/scholarships/rhodes-scholarship`
  **Current:** 93 impressions, 0 clicks, position 58
  **Action:** Add more structured content — eligibility details, application tips, past recipient stats, comparison with similar scholarships. The page needs to compete with rhodeshouse.ox.ac.uk and other established sources.
  **Why:** 93 impressions at position 58 means the query "rhodes scholarship" has strong demand but you're buried on page 7. Better content depth + internal links can move this to page 2-3.

- [ ] **P5.3** Add "related scholarships" / "related posts" internal-link blocks

  **Action:** Add a "Related Scholarships" section at the bottom of scholarship detail pages, and a "Related Posts" section at the bottom of blog detail pages. Use the API's category/tag data to find related content.
  **Why:** Search Console "Top target pages" shows individual blog/scholarship pages have only 1 internal link each. This is orphan-page territory. Adding related-content blocks creates 3-5 internal links per page, which is the minimum for good crawlability.

- [ ] **P5.4** Add cross-links from category pages to detail pages

  **File:** `frontend/src/app/scholarships/category/[slug]/CategoryContent.tsx`
  **Action:** In the scholarship cards rendered on category pages, ensure each card links to the scholarship detail page (verify `PublicScholarshipCard` already does this — it likely does). Additionally, add a "Browse all scholarships" link at the bottom linking to `/scholarships`.
  **Why:** Category pages are the highest-authority pages (linked from navigation + sitemap). They should pass link equity to detail pages.

---

### Phase 6 — Off-Page (the big gap)

- [ ] **P6.1** Verify Organization `sameAs` social profiles actually exist

  **File:** `frontend/src/app/layout.tsx` (lines 104–110)
  **Current:**
  ```ts
  sameAs: [
    'https://x.com/scholarshipright',
    'https://instagram.com/scholarshipright',
    'https://facebook.com/scholarshipright',
    'https://linkedin.com/company/scholarshipright',
    'https://tiktok.com/@scholarshipright',
    'https://youtube.com/@scholarshipright',
  ],
  ```
  **Action:** Visit each URL. If any return 404 or redirect to an unrelated page, remove them from the list. Fake social links in structured data can trigger a manual action.
  **Why:** Google uses `sameAs` to verify your organization. Dead links = negative trust signal.

- [ ] **P6.2** Start backlink acquisition

  **Current:** 0 external backlinks (confirmed by GSC "Latest links" and "More sample links" both empty).
  **Action:**
  1. Submit to scholarship directories (ScholarshipPortal, Scholars4Dev, AfterSchoolAfrica).
  2. Guest posts on education/study-abroad blogs.
  3. Share on Reddit r/scholarships, r/gradadmissions, r/studyabroad.
  4. Create shareable infographics (scholarship deadlines calendar, country comparison charts).
  **Why:** Backlinks are the #1 ranking factor Google uses. With 0 backlinks, even perfect on-page SEO won't get you to page 1 for competitive queries.

- [ ] **P6.3** Submit RSS feed + sitemap to aggregators

  **Action:**
  1. Submit RSS feed (`https://scholarshipright.com/blog/feed`) to Feedly, Bloglovin', and Google News Publisher.
  2. Submit sitemap to Google Search Console (already done) and Bing Webmaster Tools.
  3. Submit to niche scholarship directories.

---

### Phase 7 — Deploy, Validate, Monitor

- [ ] **P7.1** Deploy → resubmit sitemap in GSC

  After all code changes are deployed:
  1. Go to GSC → Sitemaps → remove old sitemap → resubmit `/sitemap.xml`
  2. Verify the sitemap now excludes /login and /signup
  3. Verify the sitemap contains all scholarship and blog pages with real lastmod dates

- [ ] **P7.2** Validate robots.txt via GSC URL inspection

  1. Go to GSC → URL Inspection → inspect `https://scholarshipright.com/robots.txt`
  2. Verify /api/ and /auth/ are now blocked
  3. Test a few /api/ URLs to confirm they return "Blocked by robots.txt" in the inspection tool

- [ ] **P7.3** Monitor 2 weeks; re-export Search Console data to compare

  After 2 weeks, export the same reports and compare:
  - Crawl requests: expect 401s to drop from 11% to <1%
  - Indexed pages: expect to see category pages moving from "Discovered" to "Indexed"
  - CTR: expect improvement from title/description changes

- [ ] **P7.4** Request longer date-range exports + full index list for next audit

  For the next audit cycle, export:
  - 6-month or 12-month data (currently only 3 months available)
  - Full page index list (not just the top pages)
  - "Crawled – not indexed" details for deeper analysis

---

## D. Deployment Order

1. **Phase 1** (P1.1–P1.4) → deploy → request indexing (P1.5)
2. **Phase 2** (P2.1–P2.6) → deploy with Phase 1
3. **Phase 3** (P3.1–P3.4) → deploy with Phase 1+2
4. **Phase 4** (P4.1–P4.4) → deploy with Phase 1+2+3
5. **Phase 5** (P5.1–P5.4) → content changes, can be incremental
6. **Phase 6** (P6.1–P6.3) → ongoing, not code-dependent
7. **Phase 7** → post-deployment validation

Phases 1–4 should be a single PR since they're all code changes in the frontend.
Phase 5 can be a separate PR (content changes).
Phase 6 is manual/ongoing work.

---

## E. Search Console Data Reference

### Performance by Country
| Country | Clicks | Impressions | CTR | Avg Position |
|---|---|---|---|---|
| Nigeria | 11 | 123 | 8.94% | 8.7 |
| Pakistan | 3 | 71 | 4.23% | 23.0 |
| Tanzania | 2 | 8 | 25.0% | — |
| Nepal | 1 | 68 | 1.47% | 4.8 |
| United States | 1 | 228 | 0.44% | 38.7 |

### Top Queries (opportunity)
| Query | Impressions | Clicks | Position |
|---|---|---|---|
| rhodes scholarship | 33 | 0 | 68 |
| how to write statement of purpose for scholarship | 23 | 0 | 83 |
| kas saiia scholarship | 17 | 0 | 8.5 |
| csc scholarship | 15 | 0 | 54 |

### Top Pages
| Page | Impressions | Clicks | CTR | Position |
|---|---|---|---|---|
| /blog/scholarship-deadlines-to-watch-julyaugust-2026 | 114 | 1 | 0.88% | 5.2 |
| /scholarships/rhodes-scholarship | 93 | 0 | 0% | 58 |
| /scholarships/google-deepmind-...mva-2026 | 54 | 4 | 7.41% | 7.5 |

### Devices
| Device | Clicks | Impressions | CTR | Avg Position |
|---|---|---|---|---|
| Desktop | 15 | 912 | 1.64% | 28.88 |
| Mobile | 6 | 346 | 1.73% | 10.62 |
| Tablet | 2 | 21 | 9.52% | 36.71 |

**Note:** Desktop gets 71% of impressions — unusual for a student-audience site. Mobile avg position (10.6) is much better than desktop (28.9), suggesting mobile content/UX may be under-serving or desktop is being crawled more aggressively.

### Coverage Summary
| Status | Count |
|---|---|
| Indexed | 144 |
| Not indexed | 29 |
| — Discovered, not indexed | 16 |
| — Excluded by noindex | 4 |
| — Blocked by robots.txt | 2 |
| — Page with redirect (FAILED) | 1 |
| — Not found (404) | 2 |
| — Alternate page with canonical | 1 |
| — Crawled, not indexed | 3 |

### Crawl Stats
| Signal | Value |
|---|---|
| Total crawl requests | 1,202 |
| OK (200) | 1,035 |
| 401/407 Unauthorized | 136 (11.33%) |
| 404 Not found | 31 |
| Googlebot Smartphone | 144 requests |
| Desktop crawl share | 71% |

### Breadcrumbs
- 8 valid breadcrumb items (all from scholarship detail pages)
- 0 errors
- Missing: blog pages, category pages, scholarships index, blog index

### External Links
- Latest links CSV: empty
- More sample links CSV: empty
- **Total external backlinks: 0**
