# Admin UX Loading State Review

**Date:** 2026-08-18
**Scope:** All `/admin/*` route loading states, shared loading components, and inline page loaders.
**Method:** Manual audit of `frontend/src/app/admin/**` + shared components, cross-checked with an OpenCode AI review run.

---

## TL;DR — why you see 2–3 different loading screens

The admin section has **five distinct loading visual families** that are never reconciled:

1. **Route-level skeleton screens** — bespoke per-route skeletons (users, scholarships, audit, invites, groups, dashboard)
2. **Plain-text placeholder screens** — centered "Loading X..." text (review, mcp)
3. **A mini branded spinner** — full-screen gray + spinning icon (accept-invite)
4. **The AdminLayout auth-check shell** — a full sidebar+topbar skeleton while `/api/auth/me` resolves (EVERY admin page)
5. **Inline fetch loaders** — rendered *after* the route screen: DataTable row skeletons, groups pulse blocks, review "Loading...", button spinners

On a normal navigation you can see **up to 3 in one trip**: route `loading.tsx` → AdminLayout auth skeleton → page mounts and shows its own inline fetch loader. Depending on route vs. data-fetch timing, you get a different combination each time — hence the "2–3 different loading screens" feel.

---

## (a) Inventory of every distinct loading visual

### Family 1 — Route-level skeleton screens (`components/admin/ui/Skeleton.tsx` primitives)

All use `Skeleton` (`bg-gray-100 animate-pulse`), `StatCardSkeleton`, `ChartCardSkeleton` from `frontend/src/components/admin/ui/Skeleton.tsx`. Layout convention: `p-6 space-y-4/6`, white `rounded-card` cards with `border-gray-200`.

| Route | Loading file | Shape |
|-------|-------------|-------|
| `/admin` (dashboard) | `app/admin/loading.tsx` | header bar + 6 KPI stat cards + 4 chart cards |
| `/admin/users` | `app/admin/users/loading.tsx` | header + search/filter bar + full table (header row + 10 rows) + pagination |
| `/admin/scholarships` | `app/admin/scholarships/loading.tsx` | header + create button + filter bar + table (8 rows) + pagination |
| `/admin/audit` | `app/admin/audit/loading.tsx` | header + toggle + filter bar + table (10 rows) + pagination |
| `/admin/invites` | `app/admin/invites/loading.tsx` | header + invite form card + table (5 rows) + pagination |
| `/admin/groups` | `app/admin/groups/loading.tsx` | header + search + 6 group-card skeletons |

These are the *best* loading states — they match real page shape (low CLS). But each is **hand-rolled** (`TableRowSkeleton` is copy-pasted into 4 files; `GroupCardSkeleton` exists only in groups).

### Family 2 — Plain-text placeholder screens

| Route | Loading file | Visual |
|-------|-------------|--------|
| `/admin/review` | `app/admin/review/loading.tsx` | centered `animate-pulse` gray text: *"Loading review queue..."* (7 lines, no structure) |
| `/admin/mcp` | `app/admin/mcp/loading.tsx` | identical pattern: *"Loading MCP management..."* |

**These violate the project's own rule** — `BrandedLoader.tsx` header explicitly states: *"Per the project's UX rule: no plain 'Loading...' text — every loading state is either a branded spinner or a structural skeleton."*

### Family 3 — Mini branded spinner

| Route | Loading file | Visual |
|-------|-------------|--------|
| `/admin/accept-invite` | `app/admin/accept-invite/loading.tsx` | full-viewport `bg-gray-100`, tiny 16px `Loader2 animate-spin` + *"Loading invite…"*. (Note: does NOT use the shared `<BrandedLoader />`, which is a 32px **gold** `text-primary-readable` spinner.) |

### Family 4 — AdminLayout auth-check shell (`components/admin/AdminLayout.tsx`)

Every `/admin/*` page renders inside `AdminLayout`, which calls `/api/auth/me` client-side. While it resolves, `LoadingView()` shows a **fourth skeleton design**: full-screen `bg-gray-100`, white 256px sidebar (logo + 5 nav bars), topbar (2 text bars), and a 4-column stat-card grid. Distinct look from Family 1 (its own `space-y` grid, different card count, sidebar present). It replaces the entire page content — including the route-level skeleton — so it's the *first* thing you see on every admin navigation.

### Family 5 — Inline fetch loaders (after the route screen is gone)

| Location | Visual |
|----------|--------|
| `components/admin/ui/DataTable.tsx` (line 291) | table-row skeletons: per-cell `h-4 w-3/4 rounded bg-gray-100 animate-pulse` — used by audit, blogs, invites, scholarships, users, review |
| `app/admin/groups/page.tsx` (line 409) | inline `h-20 bg-gray-100 rounded-lg animate-pulse` blocks while `groups.isLoading` |
| `app/admin/review/page.tsx` (line 378) | raw *"Loading..."* text in the page body |
| `app/admin/accept-invite/page.tsx` (lines 190, 303) | button-level `Loader2` spinners during submit |

### Gap — missing loading state

- **`/admin/blogs` has NO `loading.tsx`** — navigating there shows nothing from the route; you only get DataTable's inline skeleton once the page mounts. It's the crash-iest-looking navigation in the admin section.

---

## (b) Inconsistencies

1. **Three independently written `Pulse`/skeleton primitives** that look slightly different:
   - `admin/ui/Skeleton.tsx` → `bg-gray-100 animate-pulse` + `rounded`/`rounded-full`
   - `BrandedLoader.tsx` internal `Pulse` → `bg-gray-200/80 animate-pulse rounded`
   - `Skeletons.tsx` internal `Pulse` → `bg-gray-200/80 animate-pulse rounded` (same as above, duplicated)
   - The gray shades differ (`gray-100` vs `gray-200/80`) → skeletons shimmer at visibly different brightness across routes.

2. **`BrandedLoader` / `SkeletonPage` (the intended shared pattern, 62 usages across the app) is NOT used in any admin route.** Admin routes each rolled their own loading files instead — the shared abstraction exists precisely to prevent this.

3. **Four different route-level designs** (structural skeleton / text / mini-spinner / auth shell) for what should be one pattern.

4. **Stacking:** route skeleton → AdminLayout auth skeleton → inline fetch skeleton. Users see a *sequence* of different looks; on fast localhost everything compresses into a flash of multiples.

5. **Plain text loading screens** (review, mcp) ship the exact anti-pattern the project documents against.

6. Missing route (`blogs`) — inconsistent coverage.

---

## (c) Do inline loaders stack with the route loading screen?

**Yes — structurally unavoidable.** The route `loading.tsx` renders until the page component mounts; then `AdminLayout`'s auth check runs (its own skeleton); then the page's `useQuery` fetches (inline skeleton/text). Three sequential loading states per navigation, all different. On first visit the backend takes ~300ms+ for /api/auth/me plus the page query — all three show. On CPU-cached repeat visits the auth check returns in <50ms, so the AdminLayout skeleton barely flashes and you mainly see the inline one. Note this isn't a "double render" bug — it's three legitimately different lifecycle phases — but they *look* like three different screens.

---

## (d) Recommendation — one unified admin loading pattern

**Adopt a single `AdminPageSkeleton` primitive and delete the bespoke ones:**

1. **Add `AdminPageSkeleton` to `components/admin/ui/Skeleton.tsx`** with variants:
   - `'dashboard'` — KPI + chart grid (current `/admin` shape)
   - `'table'` — header + toolbar + DataTable-shaped rows (users/scholarships/audit/invites)
   - `'cards'` — group-card grid (groups)
   - `'centered'` — compact centered spinner for fast routes (accept-invite) — reuse `<BrandedLoader surface="app" label="..." />` (32px gold spinner, not the tiny gray one)
   - `'blank'` — matches AdminLayout `LoadingView` temporarily, until the auth check is moved server-side (see 4)

2. **Rewrite every admin `loading.tsx` to one line each:**
   ```tsx
   import { AdminPageSkeleton } from '@/components/admin/ui/Skeleton';
   export default () => <AdminPageSkeleton variant="table" />;
   ```
   Delete the copy-pasted `TableRowSkeleton` from all 4 files.

3. **Fix the text-loaders:** review → `<AdminPageSkeleton variant="table" />` (it is a data-table page), mcp → `variant="centered"` or a small cards variant.

4. **Add `app/admin/blogs/loading.tsx`** with `variant="table"` — closes the gap.

5. **Unify the DataTable inline skeleton** with the same primitive (`AdminPageSkeleton variant="table"` styles) so the inline transition *matches* the route transition instead of introducing a 5th look.

6. **Kill the AdminLayout auth skeleton flash:** move the admin auth check to the server (middleware or `admin/layout.tsx` server component) OR keep the client check but render it inside the same shell with the same `Skeleton` primitives so it doesn't look like a different screen. At minimum, make `LoadingView` reuse `AdminPageSkeleton` styling.

7. **Delete duplicated primitive sets:** consolidate `admin/ui/Skeleton.tsx` as the single source of truth; have `BrandedLoader`'s `Pulse` import from it.

**Effort:** ~1 focused session. 11 loading files + 1 component addition + 3 small edits. No data-layer changes.

---

## Key files

| File | Role |
|------|------|
| `frontend/src/components/admin/ui/Skeleton.tsx` | Skeleton primitives (best base to unify on) |
| `frontend/src/components/BrandedLoader.tsx` | Shared branded spinner + SkeletonPage — unused in admin |
| `frontend/src/components/admin/AdminLayout.tsx` | Auth-check skeleton shell (4th visual family) |
| `frontend/src/components/admin/ui/DataTable.tsx` | Inline table-row skeleton (5th visual family) |
| `frontend/src/app/admin/**/loading.tsx` | 9 bespoke route loaders (+ blogs missing) |