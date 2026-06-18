# Notifications & Auto-Recompute Implementation Plan

> **For Hermes:** Build phase by phase. Check in after each phase before continuing.

**Goal:** Make the platform feel alive — users get notified about things that matter (deadlines, new matches, improved matches, resume analysis failures), and match scores auto-recompute whenever the user's data changes. Remove the end-user manual recompute endpoint.

**Architecture:**
- New `app/services/notifications.py` with a single `emit_notification()` entry point + per-type dedup helpers
- Hook into the existing `recompute_matches_for_user` to emit `match_new` (≥70%, didn't exist before) and `match_improved` (jumped ≥10pts or crossed 80+) notifications
- Hook into `resumes._run_analysis` error/timeout paths to emit `resume_failed` notifications
- Admin POST scholarship endpoint + PATCH is_active flip → `mark_all_users_dirty` so new scholarships show up on users' next match read
- Remove the `POST /api/matches/compute` endpoint, its rate limit, and its frontend caller — `GET /api/matches` already handles stale-data recompute transparently

**Tech Stack:** FastAPI + SQLAlchemy async + PostgreSQL (existing) · Pydantic · `BackgroundTasks` for fire-and-forget

**User-locked decisions (from this conversation):**
- Match notif threshold: **70+ only, per-match** (no digest, one notif per new match)
- New scholarship entry: **Add admin POST + auto mark-all-dirty** (both POST and PATCH is_active false→true invalidate all users)

---

## Phase 0 — Notification helper

**Goal:** One place that all notification creation flows through. Handles dedup so we never spam the same user with the same notif type twice in a short window.

### Task 0.1: Create `backend/app/services/notifications.py`

```python
"""
Notification service.

Single entry point for creating notifications. Centralises:

  - The "notification kinds" we support
  - Dedup rules (we don't re-notify for the same kind + entity within a
    configurable window)
  - The link/title/message templates

Kinds:
  - deadline          (already created by deadline_checker.py)
  - match_new         (new scholarship crossed the 70% threshold)
  - match_improved    (a scholarship we already matched jumped significantly)
  - resume_failed     (background resume analysis failed or timed out)
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.scholarship import Scholarship


# Dedup window per kind — how long after a notif we suppress duplicates
# for the same (user, kind, scholarship_id) tuple.
DEDUP_WINDOWS = {
    "deadline": timedelta(hours=12),       # the deadline loop already gates by day
    "match_new": timedelta(days=7),
    "match_improved": timedelta(days=3),
    "resume_failed": timedelta(hours=1),   # don't spam if user keeps retrying
}


async def _dedup_hit(
    db: AsyncSession,
    *,
    user_id: UUID,
    kind: str,
    scholarship_id: Optional[UUID],
    window: timedelta,
) -> bool:
    """Return True if a non-suppressed notif of the same kind already exists
    inside the dedup window for this user (and scholarship, if provided)."""
    cutoff = datetime.now(timezone.utc) - window
    q = select(Notification).where(
        Notification.user_id == user_id,
        Notification.type == kind,
        Notification.created_at >= cutoff,
    )
    if scholarship_id is not None:
        q = q.where(Notification.scholarship_id == scholarship_id)
    return (await db.execute(q.limit(1))).scalar_one_or_none() is not None


async def emit_notification(
    db: AsyncSession,
    *,
    user_id: UUID,
    kind: str,
    title: str,
    message: str,
    link: Optional[str] = None,
    scholarship_id: Optional[UUID] = None,
    dedup: bool = True,
) -> Optional[Notification]:
    """Create a notification row, applying dedup rules.

    Returns the Notification if created, or None if suppressed by dedup.
    Caller is responsible for committing the session.
    """
    if kind not in DEDUP_WINDOWS:
        # Unknown kind — let it through (no dedup configured).
        pass
    elif dedup:
        window = DEDUP_WINDOWS[kind]
        if await _dedup_hit(
            db, user_id=user_id, kind=kind,
            scholarship_id=scholarship_id, window=window,
        ):
            return None

    n = Notification(
        user_id=user_id,
        type=kind,
        title=title,
        message=message,
        link=link,
        scholarship_id=scholarship_id,
    )
    db.add(n)
    await db.flush()
    return n


# Templates for match-related notifs -----------------------------------------

async def _load_scholarship(db: AsyncSession, scholarship_id: UUID) -> Optional[Scholarship]:
    return (await db.execute(
        select(Scholarship).where(Scholarship.id == scholarship_id)
    )).scalar_one_or_none()


async def emit_match_new(
    db: AsyncSession, *, user_id: UUID, scholarship_id: UUID, score: float,
) -> Optional[Notification]:
    """Notify the user that a new scholarship now matches them at 70%+."""
    sch = await _load_scholarship(db, scholarship_id)
    if not sch:
        return None
    return await emit_notification(
        db,
        user_id=user_id,
        kind="match_new",
        title=f"🌟 New match: {sch.name}",
        message=(
            f"{sch.name} in {sch.host_country} is a {round(score, 1)}% match for you. "
            f"Deadline: {sch.deadline.strftime('%b %d, %Y') if sch.deadline else 'open'}."
        ),
        link=f"/scholarships/{sch.slug}",
        scholarship_id=scholarship_id,
    )


async def emit_match_improved(
    db: AsyncSession, *, user_id: UUID, scholarship_id: UUID,
    new_score: float, old_score: float,
) -> Optional[Notification]:
    """Notify the user that a scholarship's match score jumped significantly."""
    sch = await _load_scholarship(db, scholarship_id)
    if not sch:
        return None
    delta = round(new_score - old_score, 1)
    return await emit_notification(
        db,
        user_id=user_id,
        kind="match_improved",
        title=f"📈 Match up: {sch.name} (+{delta} pts)",
        message=(
            f"Your match for {sch.name} improved from {round(old_score, 1)}% "
            f"to {round(new_score, 1)}%. Worth a look."
        ),
        link=f"/scholarships/{sch.slug}",
        scholarship_id=scholarship_id,
    )


async def emit_resume_failed(
    db: AsyncSession, *, user_id: UUID, resume_id: UUID, reason: str,
) -> Optional[Notification]:
    """Notify the user that background resume analysis failed."""
    return await emit_notification(
        db,
        user_id=user_id,
        kind="resume_failed",
        title="⚠️ Resume analysis failed",
        message=(
            f"We couldn't analyse your resume automatically. {reason} "
            "Open your resume to try again or edit fields manually."
        ),
        link="/resume",
        scholarship_id=None,  # not scholarship-related
    )
```

### Task 0.2: Wire deadline_checker to use the new helper

**File:** `backend/app/services/deadline_checker.py`

Replace the direct `Notification(...)` construction with `emit_notification(...)` so dedup rules apply uniformly.

### Task 0.3: Verify Phase 0 — `python -c "from app.services.notifications import emit_notification, emit_match_new, emit_match_improved, emit_resume_failed; print('ok')"` succeeds from `backend/`

---

## Phase 1 — Auto-recompute cleanup

**Goal:** Prove auto-recompute works (it does — the trigger points are already wired), and remove the manual `POST /api/matches/compute` endpoint and its frontend caller.

### Task 1.1: Remove the manual compute endpoint

**File:** `backend/app/api/matches.py`

Delete the `POST /api/matches/compute` handler and its `match_compute_rate_limit` import. Keep `GET /api/matches` (it already handles stale-data recompute on read).

### Task 1.2: Remove the rate limit

**File:** `backend/app/core/rate_limit.py`

Delete the `match_compute_rate_limit = ...` line.

### Task 1.3: Remove the frontend caller

**File:** `frontend/src/services/api.ts`

Delete the `computeMatches()` function.

**File:** `frontend/src/app/onboarding/slides/MatchesPreviewSlide.tsx`

Delete the import of `computeMatches` and the `await computeMatches();` retry block — just rely on `fetchMatches()` (the backend will recompute stale data transparently).

### Task 1.4: Update existing E2E tests

**File:** `backend/tests/e2e/test_relaxed_heuristic.py`

Drop the `call("POST", "/api/matches/compute", jar=...)` calls. The tests can rely on the auto-recompute that fires on profile update + the GET /api/matches stale-data path.

**File:** `backend/tests/e2e/test_onboarding_paths.py`

Same — drop the manual compute call.

### Task 1.5: Add new E2E test

**File:** `backend/tests/e2e/test_auto_recompute_on_profile_and_resume.py`

Steps:
1. Create a user, profile, fetchMatches() — note the score for a specific scholarship
2. Update the profile (change target_degree or target_fields)
3. Immediately fetchMatches() — assert the score for that scholarship is updated (without any explicit compute call)
4. Upload a resume, set it primary
5. fetchMatches() again — assert the score reflects resume data
6. Add `assert not has_route("/api/matches/compute")` — the endpoint must be gone

### Task 1.6: Verify Phase 1 — All existing tests + new one pass

---

## Phase 2 — Match + resume notification triggers

**Goal:** Emit `match_new`, `match_improved`, and `resume_failed` notifications at the right moments.

### Task 2.1: Hook into `recompute_matches_for_user`

**File:** `backend/app/services/match_auto.py`

Modify the function to:
- Before deleting existing MatchScores, snapshot them as `{(sch_id): old_score}` for this user
- After computing new scores, find:
  - **New matches** (not in old snapshot, new score ≥ 70): emit `match_new`
  - **Improved matches** (in old snapshot, new score - old score ≥ 10 OR new score ≥ 80 and old < 80): emit `match_improved`
  - Demoted matches: no notif
- Commit notifications in the same transaction as the match scores

### Task 2.2: Hook into `_run_analysis` failure paths

**File:** `backend/app/api/resumes.py`

In the `except asyncio.TimeoutError` and `except Exception` blocks, after setting `resume.status = "error"` and `resume.issues = [...]`, call `await emit_resume_failed(db, user_id=resume.user_id, resume_id=resume.id, reason="AI analysis timed out." or the actual error message)`.

### Task 2.3: Verify Phase 2 — Run new + existing tests

---

## Phase 3 — Admin scholarship create + global invalidate

**Goal:** Give admins a way to add new scholarships through the API. New scholarships (and reactivations) mark all users dirty, so on their next match read the recompute hook (Phase 2.1) emits `match_new` notifications for users ≥ 70%.

### Task 3.1: Add `POST /api/admin/scholarships`

**File:** `backend/app/api/admin_scholarships.py`

Add a handler that:
- Accepts a Pydantic create schema (subset of AdminScholarshipPatch + `name`, `slug`, `host_country`, `funding_type`, `deadline` as required)
- Validates and inserts the new Scholarship row
- Calls `await log_admin_action(...)` for the audit log
- If `is_active=True` (the default), calls `mark_all_users_dirty(reason=REASON_SCHOLARSHIP_DATA_CHANGED)` so users' next match read picks it up
- Returns the new scholarship

### Task 3.2: Mark all users dirty on PATCH when is_active flips false→true

**File:** `backend/app/api/admin_scholarships.py`

In the `patch_scholarship` handler, detect if `is_active` was in the patch and flipped from `False` to `True`. If so, call `mark_all_users_dirty(reason=REASON_SCHOLARSHIP_DATA_CHANGED)`. (For other field changes we don't need to global-invalidate — the user-side recompute will fire when each user next reads matches, but they'll see the OLD score for that scholarship until they visit. This is OK for now; can expand to a `mark_all_users_dirty` for all PATCHes if needed.)

### Task 3.3: E2E test for admin-scholarship → match_new notif

**File:** `backend/tests/e2e/test_admin_scholarship_creates_match_notif.py`

Steps:
1. Create a user with a complete profile (target_field = "engineering", target_degree = "master")
2. Fetch matches — note baseline
3. As an admin (use an existing super_admin or create one via the existing invite flow), POST a new scholarship targeting engineering masters with high funding
4. Wait for the background invalidate to settle (or just call GET /api/matches as the user to trigger the recompute)
5. Assert a `match_new` notification exists for that user with the new scholarship's name

### Task 3.4: Verify Phase 3 — Run the new test

---

## Phase 4 — Final verification

### Task 4.1: Run the full E2E suite

```bash
cd ~/Desktop/Scholarshipright/backend
for f in tests/e2e/test_*.py; do python3 "$f" || echo "FAILED: $f"; done
```

Expected: all green.

### Task 4.2: Commit

```bash
cd ~/Desktop/Scholarshipright
git add -A
git commit -m "feat: auto-recompute matches + notifications (match_new, match_improved, resume_failed)

- New app/services/notifications.py with emit_notification() + dedup helpers
- recompute_matches_for_user now emits match_new (>=70%) and match_improved
  (+10pt jump or crosses 80) per scholarship
- _run_analysis failure paths emit resume_failed notification
- Admin POST /api/admin/scholarships + PATCH is_active flip marks all users dirty
- Remove POST /api/matches/compute, match_compute_rate_limit, frontend
  computeMatches() — auto-recompute is fully transparent
- New e2e: test_auto_recompute_on_profile_and_resume.py
- New e2e: test_admin_scholarship_creates_match_notif.py
- Updated: test_relaxed_heuristic, test_onboarding_paths to drop manual compute"
```

---

## Decisions / Pitfalls

- **Match notif thresholds are configurable** — but hardcoded for now (70%, 10pt jump, 80% tier). Move to config if product wants to tune.
- **PATCH scholarship mark-all-dirty is conservative** — only fires on is_active false→true. Other field changes (deadline shifts, eligibility tweaks) won't re-rank existing users automatically. If product wants aggressive invalidation, expand to fire on any PATCH.
- **Dedup windows are per-kind** — match_new = 7 days, match_improved = 3 days, resume_failed = 1 hour. Tighten or loosen in `DEDUP_WINDOWS`.
- **The `_run_analysis` error path runs in a separate AsyncSessionLocal** — we create the notification on that same session and commit, so the notif is durable even if the original request handler timed out.
- **Removed `POST /api/matches/compute`** is a breaking API change. There are no external callers (the only callers were the frontend `computeMatches()` and 2 in-house e2e tests, all updated in this PR).
- **Order of operations matters in `recompute_matches_for_user`**: snapshot old scores → delete → compute new → emit notifs. The notif creation uses the new scores for the message body.
