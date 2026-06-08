# ScholarshipRight

> AI-powered scholarship discovery platform. Find fully funded international scholarships matched to your profile.

## Tech Stack

- **Frontend:** Next.js 15 (App Router) + Tailwind CSS + Zustand
- **Backend:** FastAPI + Python + SQLAlchemy + Alembic
- **Database:** PostgreSQL 15 + pgvector (vector similarity search)
- **Cache:** Redis 7
- **AI:** Claude API (ScholarBot) + sentence-transformers/fastembed (match scoring)
- **Auth:** Supabase (email magic link + Google OAuth)

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker & Docker Compose

### 1. Clone & Configure

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit .env files with your API keys
```

### 2. Start Database

```bash
docker compose up -d
```

### 3. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Seed scholarships
python seeds/seed_scholarships.py

# Generate embeddings
python scripts/embed_scholarships.py

# Start API server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Frontend Setup

```bash
cd frontend
npm install

# Proot fix (if on Android/Proot)
echo '{"presets":["next/babel"]}' > .babelrc

# Build & start
NODE_OPTIONS="--max-old-space-size=1024" npx next build
NODE_OPTIONS="--max-old-space-size=512" npx next start -p 3000 -H 0.0.0.0
```

### 5. Verify

- Frontend: http://localhost:3000
- API: http://localhost:8000/healthz
- API Docs: http://localhost:8000/docs

## Project Structure

```
scholarshipright/
├── frontend/           # Next.js 15 App Router
│   ├── src/app/        # Pages (landing, scholarships, dashboard, chat, profile)
│   ├── src/components/ # Reusable UI components
│   ├── src/services/   # API client
│   └── src/store/      # Zustand global state
│
├── backend/            # FastAPI Python app
│   ├── app/api/        # Route handlers
│   ├── app/models/     # SQLAlchemy ORM models
│   ├── app/schemas/    # Pydantic request/response schemas
│   ├── app/services/   # Business logic (match engine, scholarbot, embeddings)
│   ├── app/db/         # Database connection
│   ├── app/core/       # Config, settings
│   ├── alembic/        # DB migrations
│   ├── seeds/          # Seed data (18 scholarships)
│   └── scripts/        # Utility scripts (embed, reminders)
│
├── scripts/            # Standalone scripts
├── docker-compose.yml  # PostgreSQL + Redis
└── README.md
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scholarships` | List/search with filters |
| GET | `/api/scholarships/:slug` | Single scholarship detail |
| GET | `/api/scholarships/featured` | Featured scholarships |
| GET | `/api/profile` | Get user profile |
| POST | `/api/profile` | Create/update profile |
| GET | `/api/matches` | Get matched scholarships |
| POST | `/api/matches/compute` | Trigger match computation |
| GET | `/api/saved` | List saved scholarships |
| POST | `/api/saved/:id` | Save scholarship |
| PUT | `/api/saved/:id` | Update status/notes |
| DELETE | `/api/saved/:id` | Remove saved |
| GET | `/api/chat/sessions` | List chat sessions |
| POST | `/api/chat/sessions` | New chat session |
| POST | `/api/chat/sessions/:id/message` | Send message to ScholarBot |

## Match Scoring Algorithm

```
Score = semantic_score (0-60) + rule_bonuses (0-40)

+15  field_of_study match
+10  country eligibility
+8   degree_level match
+5   start_date within window
+5   no IELTS required
-20  hard fail: degree mismatch
-15  hard fail: nationality ineligible
-10  application fee penalty
```

## License

MIT
