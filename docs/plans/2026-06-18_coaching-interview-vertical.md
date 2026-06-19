# Coaching + Interview Vertical — Design Plan

**Date:** 2026-06-18
**Status:** Proposed (no code yet)
**Author:** Hermes planning session
**Repo:** ScholarshipRight

---

## 0. Problem Statement

Today, `/coaching` and `/interview` are 69-line "Coming Soon" placeholders. There is **zero backend code** for either — no models, no APIs, no DB tables. The nav links them; the pages are empty.

The user wants to build a real vertical with **three distinct features**:

1. **Human Coaches** — partner with real coaches for 1-on-1 sessions with experienced users
2. **Scholarship Interview Intelligence** — per-scholarship interview format, duration, question count, expected questions
3. **Mock Interview Practice** — let users practice against the per-scholarship question bank

This is a strategic moat (no competitor in this space has scholarship-specific interview data at scale) AND a marketplace (high-margin revenue from coaching).

---

## 1. Current State Audit

| Layer | Path | State | LOC |
|---|---|---|---|
| Frontend `/coaching` | `frontend/src/app/coaching/page.tsx` | Static placeholder | 69 |
| Frontend `/interview` | `frontend/src/app/interview/page.tsx` | Static placeholder | 69 |
| Backend `coaching` router | (none) | ❌ Missing | 0 |
| Backend `interview` router | (none) | ❌ Missing | 0 |
| DB models for coaches/sessions | (none) | ❌ Missing | 0 |
| DB models for interview data | (none) | ❌ Missing | 0 |
| Sidebar / PageHeader nav | `Sidebar.tsx`, `PageHeader.tsx` | ✅ Already links `/coaching`, `/interview` | — |
| Overlap with existing Scholara | `backend/app/services/agent.py` (767 LOC) | ✅ Can be reused for AI mock scoring | — |

**Conclusion:** greenfield. No migration concerns. Can build in any order.

---

## 2. Open Business Questions (must answer before #1)

These are NOT code questions — they shape the data model and admin UX. Blockers for the coach marketplace:

| # | Question | Why it matters | Possible answers |
|---|---|---|---|
| B1 | **Coach partnership model** | Determines payments, onboarding, legal | (a) Employees — we pay salary<br>(b) Independent contractors via Stripe Connect (we take %)<br>(c) Invite-only partner network (fixed rate, we vet) |
| B2 | **Pricing model** | Determines schema fields | Free / per-session / per-month subscription / freemium |
| B3 | **Coach acquisition** | Determines marketing surface | Apply form / manual invite / partner org referral |
| B4 | **Vetting process** | Determines admin UI | Resume review + sample session / reference check / certification required |
| B5 | **Video stack** | Determines infra + cost | Daily.co (easiest) / Whereby (simplest embed) / Twilio (flexible) / Jitsi (self-host) |
| B6 | **Dispute / refund policy** | Determines admin tools | Coach-side cancel / user-side cancel window / no-show rules |
| B7 | **Coach language / region** | Determines search filters | Multilingual? Per-country? |

**Recommendation for B5:** **Daily.co**. Best DX, no-SDK install required, generous free tier, works in Proot dev. Whereby is runner-up if we want zero dev work on the video layer.

---

## 3. Open Content Questions (must answer before #2)

For interview intelligence, we need a **seed strategy** for the question bank:

| # | Question | Why it matters | Possible answers |
|---|---|---|---|
| C1 | **Where do interview questions come from?** | Determines admin UX + source attribution | (a) Admin enters manually per scholarship<br>(b) User-contributed, moderated<br>(c) AI-generated generic per field<br>(d) Public scholarship sites (scraped with permission) |
| C2 | **How do we handle scholarships with no interview?** | Determines schema | `interview_required: bool` — if false, show "No interview required" card |
| C3 | **Quality bar for a "real" question?** | Determines moderation | Past-applicant reported only / must include source / etc. |
| C4 | **Categories of questions** | Determines tags + filters | Behavioral / Technical / Motivation / Situational / Ethics / Field-specific |

**Recommendation for C1:** start with **(a) admin-entered manually** for ~20 flagship scholarships to seed the catalog, then open **(b) user-contributed** with moderation. AI-generated (c) is fallback only.

---

## 4. Proposed Build Order

The features have **zero technical dependency on each other** but build in this order for product-strategy reasons:

| Phase | Feature | Why this order | Estimated effort |
|---|---|---|---|
| **1** | **Interview Intelligence** (read-side) | No third-party deps, no humans needed, can ship fast, demonstrates value immediately | 1–2 days |
| **2** | **Admin UI for interview data** (write-side) | Lets us seed the data, makes the feature real | 1 day |
| **3** | **Mock Interview Practice** (uses existing Scholara agent) | Reuses streaming AI agent — adds the practice loop on top of #1's data | 2–3 days |
| **4** | **Coach profiles + discovery** | Needs the business questions B1–B7 answered first | 3–5 days (after business answers) |
| **5** | **Coach booking + sessions + video** | Largest piece; needs real human partners to test | 5–7 days |
| **6** | **Coach dashboard + payouts + reviews** | Closes the marketplace loop | 3–4 days |

**Total:** ~3 weeks of focused build. Phase 1–3 ship a complete **interview prep product** with no humans needed. Phases 4–6 are the **coach marketplace** that needs the business answers above.

---

## 5. Detailed Schema Design (for reference, not for code yet)

### 5.1 Interview Intelligence — DB models

```python
class InterviewFormat(Base):
    """Per-scholarship interview metadata. 1:1 with Scholarship."""
    __tablename__ = "interview_formats"
    id: int PK
    scholarship_id: int FK → scholarships (UNIQUE)
    # The what
    has_interview: bool                 # C2 — explicit "no" support
    interview_type: str                 # "panel" | "one_on_one" | "video" | "written" | "phone" | "group"
    typical_duration_min: int | None    # e.g. 30
    typical_question_count: int | None  # e.g. 5
    # The how
    evaluation_criteria: str | None     # free text: "academic merit, leadership, fit"
    prep_notes: str | None              # free text admin notes
    # Meta
    source: str | None                  # "scholarship.org" / "past_applicant_2024" / "admin"
    source_url: str | None
    last_verified_at: datetime | None
    created_at / updated_at

class InterviewQuestion(Base):
    """Sample/real questions, scoped to a scholarship."""
    __tablename__ = "interview_questions"
    id: int PK
    scholarship_id: int FK → scholarships
    question: str                       # "Tell us about a time you led a team."
    category: str                       # C4 — behavioral / technical / etc.
    difficulty: int                     # 1–5
    sample_answer: str | None           # optional — for premium
    source: str | None                  # "past_applicant" / "official" / "admin"
    is_published: bool                  # moderation gate
    created_at / updated_at

class MockInterviewSession(Base):
    """A user's practice session against a scholarship's question bank."""
    __tablename__ = "mock_interview_sessions"
    id: int PK
    user_id: int FK → users
    scholarship_id: int FK
    started_at: datetime
    completed_at: datetime | None
    questions_attempted: int
    average_score: float | None         # 0–100, Scholara-graded
    # Per-question scores live in a child table or JSONB
```

### 5.2 Coach Marketplace — DB models

```python
class CoachProfile(Base):
    __tablename__ = "coach_profiles"
    id: int PK
    user_id: int FK → users (UNIQUE)          # coach is also a platform user
    display_name: str
    headline: str                              # "Ex-Rhodes Scholar | 5 yrs mentoring"
    bio: str
    expertise: list[str]                       # ["STEM", "MBA apps", "Personal statement"]
    languages: list[str]                       # ["en", "fr", "ha"] (C7)
    years_experience: int
    hourly_rate_cents: int
    currency: str                              # "USD"
    is_verified: bool                          # B4
    is_accepting_bookings: bool
    rating_avg: float                          # denormalized
    rating_count: int
    intro_video_url: str | None                # optional
    created_at / updated_at

class CoachAvailability(Base):
    """Weekly recurring slots. Bookings consume from these."""
    __tablename__ = "coach_availability"
    id: int PK
    coach_id: int FK
    weekday: int                               # 0–6
    start_time: time
    end_time: time

class CoachingSession(Base):
    __tablename__ = "coaching_sessions"
    id: int PK
    coach_id: int FK
    student_id: int FK → users
    scheduled_start: datetime
    scheduled_end: datetime
    status: str                                # "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show"
    meeting_url: str | None                    # Daily.co room
    price_cents: int
    currency: str
    payment_intent_id: str | None              # Stripe
    cancellation_reason: str | None
    student_notes: str | None
    coach_notes: str | None
    created_at / updated_at

class CoachReview(Base):
    __tablename__ = "coach_reviews"
    id: int PK
    session_id: int FK (UNIQUE)
    rating: int                                # 1–5
    review_text: str | None
    created_at
```

---

## 6. API Surface (proposed)

### Interview Intelligence
```
GET    /api/interview/scholarships/{id}/format          → InterviewFormat
GET    /api/interview/scholarships/{id}/questions       → list[InterviewQuestion] (published only)
POST   /api/interview/sessions                          → create mock session
POST   /api/interview/sessions/{id}/answer              → submit answer, get AI score (uses Scholara)
GET    /api/interview/sessions/{id}                     → session detail + per-question scores

# Admin
POST   /api/admin/interview/formats                     → upsert format per scholarship
POST   /api/admin/interview/questions                   → create question
PATCH  /api/admin/interview/questions/{id}              → edit
DELETE /api/admin/interview/questions/{id}
POST   /api/admin/interview/questions/{id}/publish      → moderation gate
```

### Coach Marketplace
```
# Public discovery
GET    /api/coaches                                      → search/filter (expertise, lang, price, rating)
GET    /api/coaches/{id}                                 → coach profile + availability

# Coach (auth)
POST   /api/coach/apply                                  → submit application
GET    /api/coach/profile                                → own profile
PATCH  /api/coach/profile                                → edit
POST   /api/coach/availability                           → set recurring slots
DELETE /api/coach/availability/{id}

# Student (auth)
GET    /api/coach/{id}/slots?from=...&to=...            → bookable time slots
POST   /api/coach/{id}/book                              → {start, notes} → returns session + payment intent
GET    /api/me/coaching/sessions                         → my sessions
PATCH  /api/me/coaching/sessions/{id}/cancel             → cancel

# Session
POST   /api/coaching/sessions/{id}/start                 → creates Daily room, returns meeting_url
POST   /api/coaching/sessions/{id}/complete              → mark done, trigger review prompt
POST   /api/coaching/sessions/{id}/review                → {rating, text}

# Admin
GET    /api/admin/coach/applications
POST   /api/admin/coach/applications/{id}/approve
POST   /api/admin/coach/applications/{id}/reject
```

---

## 7. Frontend Pages (proposed)

| Route | Purpose | Phase |
|---|---|---|
| `/interview` | List of user's past sessions + "Start a mock" CTA → pick scholarship | 3 |
| `/interview/scholarship/[slug]` | Show interview format + question count + start practice | 3 |
| `/interview/practice/[sessionId]` | Live mock — question by question, timer, AI scoring | 3 |
| `/scholarships/[slug]` | New tab: "Interview Prep" (shows format, sample Q's) | 1 |
| `/coaches` | Browse + filter coaches | 4 |
| `/coaches/[id]` | Coach profile, availability, book button | 4 |
| `/coach/dashboard` | Coach-side: schedule, earnings, students | 6 |
| `/coach/apply` | Application form | 4 |
| `/admin/coaches` | Admin: applications, verification, disputes | 4 |
| `/admin/interview` | Admin: interview formats + question bank moderation | 2 |

---

## 8. Phase 1 — Interview Intelligence (Read-Only) Detailed

**Goal:** Replace the "Coming Soon" page with a real product. Users can see per-scholarship interview format and sample questions on each scholarship detail page.

**Backend work:**
1. New models: `InterviewFormat`, `InterviewQuestion` (no `MockInterviewSession` yet)
2. Alembic migration
3. Seed script for ~20 flagship scholarships (admin-entered)
4. Pydantic schemas
5. Router: `GET /api/interview/scholarships/{id}/format`, `GET .../questions`
6. Cache (Redis) for 5min — read-heavy

**Frontend work:**
1. `/interview/page.tsx` rewrite → real page listing format+questions, with "pick a scholarship" CTA
2. `/scholarships/[slug]/page.tsx` → new "Interview Prep" tab/section
3. API client methods in `frontend/src/lib/api.ts`
4. Loading + empty + error states

**Tests:** E2E that admin can add a question via direct DB or admin API, then it's readable publicly. Page renders the question. Cache invalidation works.

**Done when:** `/interview` shows real data. Scholarship pages show interview prep section. ~20 scholarships seeded.

---

## 9. Phase 2 — Admin UI for Interview Data

**Goal:** Let admins manage interview formats + question bank without touching the DB.

**Backend work:** CRUD endpoints (listed in §6 Admin section). Pydantic. RBAC: super_admin or content_admin role.

**Frontend work:**
1. New admin route `/admin/interview`
2. List view: all scholarships with format status (set / not set / stale)
3. Edit view per scholarship: format fields + question list (add, edit, delete, publish)
4. Bulk import: paste CSV/JSON of questions per scholarship

**Done when:** admin can add a scholarship's interview format and 5 questions from the admin panel, all readable on the public side.

---

## 10. Phase 3 — Mock Interview Practice

**Goal:** Users can run a timed practice session against a scholarship's question bank, with AI scoring via Scholara.

**Backend work:**
1. New model: `MockInterviewSession` + per-question scoring
2. Endpoints: create session, submit answer (streams Scholara evaluation), get session
3. Reuse existing `services/agent.py` Scholara agent with a new "interview evaluator" tool/prompt

**Frontend work:**
1. `/interview/scholarship/[slug]` → "Start practice" button
2. `/interview/practice/[sessionId]` → live UI: question card, textarea, timer, score reveal, next
3. Per-question feedback (strengths, improvements, suggested better answer)
4. End-of-session summary: average score, time taken, weakest categories

**Done when:** user can complete a 5-question mock interview for one of the seeded scholarships and see scored results.

---

## 11. Phase 4–6 — Coach Marketplace (NOT detailed until B1–B7 answered)

Phases 4–6 are sketched in §4 but the implementation depends on business answers in §2. When you decide on partnership model, I'll come back and detail those phases the same way.

---

## 12. Risks + Open Questions

| Risk | Mitigation |
|---|---|
| **Interview data is hard to source** | Seed with admin-entered for ~20 flagship scholarships; allow user-contributed with moderation; AI-generate as fallback |
| **Coach marketplace has zero real coaches at launch** | Phase the launch: ship interview prep first (#1–3), recruit coaches in parallel via partner orgs, only enable marketplace when N coaches are vetted |
| **Video calling has cross-network issues in Proot dev** | Daily.co is browser-based — works fine. Jitsi is the fallback if we hit infra issues |
| **Stripe Connect has country/kyc requirements** | Only relevant after B1 is answered |
| **Coach supply < student demand** | Allow waitlists; show "0 coaches available, be notified when X is" UX |

---

## 13. Success Metrics

| Phase | Metric | Target |
|---|---|---|
| 1 | Scholarship pages with interview data | ≥20 flagship |
| 1 | `/interview` MAU | track baseline |
| 2 | Admin can manage without dev help | qualitative |
| 3 | Mock interview completion rate | ≥40% start → finish |
| 4 | Coach profiles live | ≥3 vetted |
| 5 | First paid session completed | ≥1 by launch + 30d |
| 6 | Coach retention (90d) | ≥60% |

---

## 14. Decision Points to Bring to You

1. **Build order** — start with Phase 1 (interview intel) or jump to Phase 4 (coach marketplace)?
2. **Business questions B1–B7** — answer now, or punt until Phase 4?
3. **Content questions C1–C4** — answer now so we can design the admin UI correctly?
4. **Seed scope for Phase 1** — how many scholarships to seed? Which ones? I propose the top 20 by user interest.
5. **Video stack** — Daily.co OK? Or do you have a preference?

---

**End of plan. No code written. Awaiting your call on §14.**
