# ScholarshipRight — AI Agent Build Plan

> Project: ScholarshipRight — AI-powered scholarship discovery platform (Jobright.ai replica for scholarships)
> Stack: React + Tailwind (frontend) · FastAPI + Python (backend) · PostgreSQL + Redis · Claude API · sentence-transformers
> Agent instructions: Follow phases sequentially. Complete all tasks in a phase before moving to the next. Never skip a validation step. When in doubt, refer to the schema and conventions defined in this file.

---

## Project Structure to Scaffold

```
scholarshipright/
├── frontend/                  # React + Tailwind SPA
│   ├── public/
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Route-level page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── services/          # API call functions
│   │   ├── store/             # Zustand global state
│   │   ├── types/             # TypeScript interfaces
│   │   └── utils/             # Helpers, formatters
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── backend/                   # FastAPI Python app
│   ├── app/
│   │   ├── api/               # Route handlers
│   │   │   ├── scholarships.py
│   │   │   ├── users.py
│   │   │   ├── matches.py
│   │   │   ├── chat.py
│   │   │   └── reminders.py
│   │   ├── models/            # SQLAlchemy ORM models
│   │   ├── schemas/           # Pydantic request/response schemas
│   │   ├── services/          # Business logic layer
│   │   │   ├── match_engine.py
│   │   │   ├── embeddings.py
│   │   │   ├── scholarbot.py
│   │   │   └── reminders.py
│   │   ├── db/                # DB connection, migrations
│   │   ├── core/              # Config, settings, auth
│   │   └── main.py            # FastAPI app entry point
│   ├── alembic/               # DB migration files
│   ├── seeds/                 # Seed data scripts
│   │   └── scholarships.json  # Initial 100+ scholarships
│   ├── requirements.txt
│   └── .env.example
│
├── scripts/                   # Standalone utility scripts
│   ├── scraper.py             # Scholarship scraper (Firecrawl)
│   ├── embed_scholarships.py  # Batch embed all scholarships
│   └── send_reminders.py      # Cron job for deadline emails
│
├── docker-compose.yml         # PostgreSQL + Redis + backend
├── .env.example
└── README.md
```

---

## Environment Variables

Create `.env` at project root and `backend/.env` with these keys:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/scholarshipright
REDIS_URL=redis://localhost:6379

# Auth (Supabase)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=xxxx
SUPABASE_SERVICE_ROLE_KEY=xxxx

# AI
ANTHROPIC_API_KEY=xxxx
CLAUDE_MODEL=claude-sonnet-4-20250514

# Email
RESEND_API_KEY=xxxx
FROM_EMAIL=noreply@scholarshipright.com

# App
FRONTEND_URL=http://localhost:5173
SECRET_KEY=generate-a-random-secret-key
```

---

## Database Schema

### Table: users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: profiles

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Academic background
  degree_level TEXT,              -- 'bachelor', 'master', 'phd'
  cgpa NUMERIC(3,2),
  cgpa_scale NUMERIC(3,1),        -- e.g. 5.0 or 4.0
  degree_class TEXT,              -- '2:1', 'First Class', etc.
  field_of_study TEXT,
  graduation_year INT,
  university TEXT,
  country_of_origin TEXT,

  -- Research & experience
  publications TEXT[],
  research_interests TEXT[],
  certifications TEXT[],
  work_experience_years INT,

  -- Target preferences
  target_degree TEXT,             -- 'master', 'phd'
  target_fields TEXT[],
  target_start_date DATE,
  target_countries TEXT[],
  has_ielts BOOLEAN DEFAULT FALSE,
  ielts_score NUMERIC(3,1),

  -- Language
  languages TEXT[],               -- ['English', 'French', 'Arabic']

  -- Embedding
  embedding VECTOR(384),          -- sentence-transformers output

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: scholarships

```sql
CREATE TABLE scholarships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  host_country TEXT NOT NULL,
  host_institution TEXT,
  provider TEXT,                   -- e.g. 'DAAD', 'Chevening', 'Gates'

  -- Scope
  degree_levels TEXT[],            -- ['master', 'phd']
  fields_of_study TEXT[],
  eligible_nationalities TEXT[],   -- ['All', 'African', 'Nigerian'] etc.
  eligible_regions TEXT[],

  -- Funding
  funding_type TEXT NOT NULL,      -- 'fully_funded', 'partial', 'stipend_only'
  covers_tuition BOOLEAN DEFAULT TRUE,
  covers_living BOOLEAN DEFAULT FALSE,
  covers_flight BOOLEAN DEFAULT FALSE,
  covers_health BOOLEAN DEFAULT FALSE,
  monthly_stipend_usd INT,

  -- Requirements
  requires_ielts BOOLEAN DEFAULT TRUE,
  min_ielts_score NUMERIC(3,1),
  requires_gre BOOLEAN DEFAULT FALSE,
  requires_application_fee BOOLEAN DEFAULT FALSE,
  min_cgpa NUMERIC(3,2),
  language_of_instruction TEXT DEFAULT 'English',

  -- Dates
  open_date DATE,
  deadline DATE NOT NULL,
  program_start_date DATE,
  duration_months INT,

  -- Content
  description TEXT,
  benefits_summary TEXT,
  how_to_apply TEXT,
  official_url TEXT NOT NULL,
  logo_url TEXT,

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  source TEXT,                     -- where we got this data
  view_count INT DEFAULT 0,
  application_count INT DEFAULT 0,

  -- Embedding
  embedding VECTOR(384),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: saved_scholarships

```sql
CREATE TABLE saved_scholarships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scholarship_id UUID REFERENCES scholarships(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'saved',     -- 'saved', 'applying', 'applied', 'rejected', 'accepted'
  notes TEXT,
  reminder_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, scholarship_id)
);
```

### Table: match_scores

```sql
CREATE TABLE match_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scholarship_id UUID REFERENCES scholarships(id) ON DELETE CASCADE,
  score NUMERIC(5,2),              -- 0.00 to 100.00
  breakdown JSONB,                 -- { semantic: 72, field: 10, country: 10, ... }
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, scholarship_id)
);
```

### Table: chat_sessions

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]',     -- [{role, content, timestamp}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API Endpoints

### Auth (handled by Supabase — no custom routes needed)

### Scholarships

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scholarships` | List/search scholarships with filters |
| GET | `/api/scholarships/:slug` | Get single scholarship detail |
| GET | `/api/scholarships/featured` | Get featured/trending scholarships |
| POST | `/api/scholarships` | Admin: create scholarship |
| PUT | `/api/scholarships/:id` | Admin: update scholarship |

**Query params for GET /api/scholarships:**
```
?degree=master,phd
&field=computer_science,ai
&country=germany,japan,uk
&funding=fully_funded
&no_ielts=true
&no_fee=true
&deadline_before=2026-12-31
&deadline_after=2026-06-01
&search=nlp+scholarship
&page=1&limit=20
&sort=deadline_asc|match_score_desc|newest
```

### User Profile

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/profile` | Get current user profile |
| POST | `/api/profile` | Create/update profile |
| POST | `/api/profile/embed` | Recompute profile embedding |

### Match Engine

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/matches` | Get scholarships sorted by match score |
| POST | `/api/matches/compute` | Trigger match score computation for user |

### Saved Scholarships

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/saved` | List user's saved scholarships |
| POST | `/api/saved/:scholarship_id` | Save a scholarship |
| PUT | `/api/saved/:scholarship_id` | Update status or notes |
| DELETE | `/api/saved/:scholarship_id` | Remove saved scholarship |

### ScholarBot (AI Chat)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/chat/sessions` | List chat sessions |
| POST | `/api/chat/sessions` | Start new session |
| POST | `/api/chat/sessions/:id/message` | Send message, get AI reply (streaming) |

### Reminders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reminders` | List active reminders |
| POST | `/api/reminders/:saved_id` | Enable reminder for saved scholarship |
| DELETE | `/api/reminders/:saved_id` | Disable reminder |

---

## AI Match Scoring — Implementation Spec

File: `backend/app/services/match_engine.py`

```python
"""
Match scoring algorithm.

Score = semantic_score (0-60) + rule_bonuses (0-40)

Rule bonuses:
  +15  field_of_study exact or sibling match
  +10  country eligibility confirmed
  +8   degree_level match
  +5   start_date within user's window (±6 months)
  +5   no_ielts required and user has no IELTS
  -20  hard fail: degree level mismatch (ineligible)
  -15  hard fail: nationality not eligible
  -10  requires application fee (penalize for target user)
"""

def compute_match_score(profile: Profile, scholarship: Scholarship) -> dict:
    # 1. Semantic similarity (cosine of embeddings)
    semantic = cosine_similarity(profile.embedding, scholarship.embedding) * 60

    # 2. Rule-based adjustments
    bonuses = {}
    bonuses["field"] = field_match_score(profile.target_fields, scholarship.fields_of_study)
    bonuses["country"] = country_eligibility_score(profile.country_of_origin, scholarship.eligible_nationalities)
    bonuses["degree"] = degree_match_score(profile.target_degree, scholarship.degree_levels)
    bonuses["start_date"] = start_date_score(profile.target_start_date, scholarship.program_start_date)
    bonuses["no_ielts"] = no_ielts_bonus(profile.has_ielts, scholarship.requires_ielts)
    bonuses["fee_penalty"] = fee_penalty(scholarship.requires_application_fee)

    total = min(100, max(0, semantic + sum(bonuses.values())))
    return {"score": round(total, 2), "breakdown": {"semantic": round(semantic, 2), **bonuses}}
```

Embedding model: `sentence-transformers/all-MiniLM-L6-v2` (384-dim, fast, free)

When to recompute: On profile update, or on demand via `/api/matches/compute`. Cache in `match_scores` table with TTL of 24h.

---

## ScholarBot — System Prompt

File: `backend/app/services/scholarbot.py`

```python
SCHOLARBOT_SYSTEM = """
You are ScholarBot, an expert scholarship advisor built into ScholarshipRight.
You help users find, understand, and apply for fully funded international scholarships.

Your user's profile:
{profile_json}

Available scholarships (filtered by relevance):
{scholarships_json}

Your capabilities:
- Recommend scholarships from the database based on user's profile
- Explain eligibility, deadlines, and what each scholarship covers
- Help draft Statements of Purpose (SOP), motivation letters, research proposals
- Answer questions about scholarship processes (IELTS waivers, referee letters, etc.)
- Compare multiple scholarships side by side
- Set realistic expectations about competitiveness

Rules:
- Only reference scholarships that exist in the provided list
- Never invent scholarship names, deadlines, or URLs
- Always mention the official deadline when recommending a scholarship
- Be concise but complete — users are busy students
- If a user asks about a scholarship not in the list, say you don't have that one indexed yet and direct them to the official site
- For SOP/writing help, ask for the specific scholarship and program before drafting
"""
```

---

## Frontend Pages & Components

### Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `LandingPage` | Marketing page with waitlist CTA |
| `/login` | `AuthPage` | Supabase auth (email magic link / Google) |
| `/onboarding` | `ProfileBuilder` | Multi-step profile setup (first-time users) |
| `/dashboard` | `Dashboard` | Match feed + summary stats |
| `/scholarships` | `ScholarshipFeed` | Full browsable scholarship list |
| `/scholarships/:slug` | `ScholarshipDetail` | Single scholarship deep-dive |
| `/saved` | `SavedScholarships` | Saved list with status tracking |
| `/chat` | `ScholarBotPage` | Full-page AI chat interface |
| `/profile` | `ProfilePage` | Edit profile, view match stats |
| `/admin` | `AdminPanel` | Add/edit scholarships (protected) |

### Key Reusable Components

```
ScholarshipCard         — Feed card with name, deadline badge, match score, fund tags
MatchScoreBadge         — Circular % badge (green >80, yellow >60, gray <60)
DeadlineBadge           — "Closes in X days" with color urgency
FundingTags             — Pills for: Fully Funded / Flight / Stipend / Housing
FilterSidebar           — All filter controls for the feed
ProfileStepForm         — Individual step in multi-step profile builder
ScholarBotChat          — Chat bubble UI with streaming support
SaveButton              — Toggle save/unsave with optimistic UI
StatusDropdown          — Change application status (saved/applying/applied/etc.)
```

---

## Seed Data Format

**File:** `backend/seeds/scholarships.json`

Each scholarship entry must follow this structure:

```json
{
  "name": "DAAD Development-Related Postgraduate Courses",
  "slug": "daad-development-postgraduate",
  "host_country": "Germany",
  "host_institution": "Various German Universities",
  "provider": "DAAD",
  "degree_levels": ["master"],
  "fields_of_study": ["engineering", "agriculture", "public_health", "economics", "natural_sciences"],
  "eligible_nationalities": ["All developing countries"],
  "eligible_regions": ["Africa", "Asia", "Latin America"],
  "funding_type": "fully_funded",
  "covers_tuition": true,
  "covers_living": true,
  "covers_flight": true,
  "covers_health": true,
  "monthly_stipend_usd": 934,
  "requires_ielts": false,
  "requires_gre": false,
  "requires_application_fee": false,
  "min_cgpa": 2.5,
  "language_of_instruction": "English/German",
  "deadline": "2026-10-31",
  "program_start_date": "2027-10-01",
  "duration_months": 24,
  "description": "Scholarships for graduates from developing countries to pursue postgraduate degrees in Germany in development-related fields.",
  "official_url": "https://www.daad.de/en/study-and-research-in-germany/scholarships/",
  "is_verified": true,
  "source": "daad.de"
}
```

**Priority scholarships to seed first (fully funded, Africa-eligible, 2027 start):**
- DAAD (Germany) — multiple tracks
- Chevening (UK)
- Commonwealth Masters & PhD (UK)
- MEXT Research Student (Japan)
- Fulbright (USA)
- ARES (Belgium)
- CFI / OFID (various)
- Mastercard Foundation (Canada/Africa)
- Aga Khan Foundation
- Gates Cambridge (UK)
- ETH Zurich Excellence (Switzerland)
- Korean Government Scholarship (KGSP)
- Chinese Government Scholarship (CSC)
- Turkish Government Scholarship (Türkiye Bursları)
- Australia Awards
- NUFFIC/NFP (Netherlands)
- Swedish Institute
- Eiffel Excellence (France)

---

## Phase-by-Phase Agent Tasks

### PHASE 0 — Project Bootstrap

(TBD — to be defined)
