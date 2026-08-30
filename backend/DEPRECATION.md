# Deprecation: `eligible_nationalities` / `eligible_regions`

The two legacy free-text columns on the `scholarships` table are
**write-frozen** as of this commit. They remain on the model and in the
DB for backwards compatibility, but new admin writes are no longer
accepted. The structured eligibility fields are the source of truth.

## Why

The match engine reads `resolved_countries` (derived from
`included_groups` / `included_countries` / `excluded_groups` /
`excluded_countries`). The legacy columns were free-text and could not
drive matching. After introducing the structured fields, the legacy
columns were redundant for matching but still being written by the
admin form, the URL extractor, and the seed scraper — creating two
parallel representations of the same concept.

## What's frozen

- **Admin create form** (`scholarshipForm.buildCreateBody`) — does not
  send `eligible_nationalities` / `eligible_regions`.
- **Admin edit form** (`scholarshipForm.buildPatchBody`) — does not
  diff/send them.
- **CreateScholarshipWizard** — no longer renders the legacy
  MultiSelects.
- **URL extractor** (`url_extractor.EXTRACT_PROMPT`) — no longer
  asks the LLM for them.
- **Agent endpoint** (`app/api/agent.py`) and **agent_tools**
  (`app/services/agent_tools.py`) — no longer return them in responses;
  replaced by the structured fields.

## What still writes the columns (intentional)

- **Seed scraper** (`backend/seeds/scrape.py`) — populates from
  external CSV/JSON imports for historical continuity.
- **Model backfill** (`backend/app/models/scholarship.py`) — on app
  startup, copies legacy values into `eligibility_display` and best-
  effort maps to `included_groups` for scholarships that lack
  structured data. This is a one-shot migration; once a scholarship
  has structured data the backfill skips it.

## UI changes

- **Admin edit page** still shows a read-only "Legacy eligibility
  text" panel when the scholarship has legacy values, so admins can
  see what's there. Editing is disabled.
- **Public detail page** still renders the resolved structured set as
  the source of truth (`eligibilityInfo` in
  `ScholarshipDetailClient.tsx`).
- **Public `services/api.ts` Scholarship type** still has the legacy
  field as `readonly` for legacy data display, but the resolved set
  is what the UI shows.

## Phase 2 (future, not this PR)

When the backfill has run across all rows (no more scholarships
without structured data), the columns and form panel can be dropped
entirely:

1. Stop reading `eligible_nationalities` / `eligible_regions` in any
   code path (currently only the model backfill reads them).
2. Drop the columns from `Scholarship` model + Alembic migration.
3. Drop the legacy UI panel from the admin edit page.
4. Drop the legacy field from `services/api.ts` and the public
   detail client.
5. Update tests that touch these fields.

## Tracking

- Audit: see the audit report conversation for the full analysis.
- Backfill completeness query: `SELECT COUNT(*) FROM scholarships
  WHERE eligibility_unresolved = TRUE AND (array_length(
  eligible_nationalities, 1) > 0 OR array_length(eligible_regions,
  1) > 0);` — non-zero rows still need admin attention.
