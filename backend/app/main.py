import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import get_settings
from app.api import scholarships, users, matches, saved, reminders, auth, resumes, agent
from app.api import admin_matches
from app.api import admin_overview
from app.api import admin_users
from app.api import admin_scholarships
from app.api import admin_audit
from app.api import admin_invites as admin_invites_module
from app.api.notifications import router as notifications_router
from app.services.deadline_checker import deadline_checker_loop
from app.services.match_auto import ensure_schema_columns
from app.core.admin import ensure_admin_schema_columns
from app.models.admin_audit import ensure_audit_schema_columns
from app.models.admin_invite import ensure_invites_schema_columns
from app.models.password_reset import ensure_password_reset_schema_columns
from app.models.scholarship import ensure_scholarship_schema_columns

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure the new match-recompute columns exist (idempotent).
    try:
        await ensure_schema_columns()
    except Exception as e:  # noqa: BLE001
        # Don't crash the app for a migration problem — log loudly.
        print(f"ensure_schema_columns failed: {e}")

    # Startup: ensure the admin columns exist (idempotent).
    try:
        await ensure_admin_schema_columns()
    except Exception as e:  # noqa: BLE001
        print(f"ensure_admin_schema_columns failed: {e}")

    # Startup: ensure the admin_audit_log table exists (idempotent).
    try:
        await ensure_audit_schema_columns()
    except Exception as e:  # noqa: BLE001
        print(f"ensure_audit_schema_columns failed: {e}")

    # Startup: ensure the admin_invites table exists (idempotent).
    try:
        await ensure_invites_schema_columns()
    except Exception as e:  # noqa: BLE001
        print(f"ensure_invites_schema_columns failed: {e}")

    # Startup: ensure the accepted_english_tests column exists on
    # scholarships (idempotent). Pairs with the Scholarship model.
    try:
        await ensure_scholarship_schema_columns()
    except Exception as e:  # noqa: BLE001
        print(f"ensure_scholarship_schema_columns failed: {e}")

    # Startup: ensure the password_reset_tokens table exists (idempotent).
    try:
        await ensure_password_reset_schema_columns()
    except Exception as e:  # noqa: BLE001
        print(f"ensure_password_reset_schema_columns failed: {e}")

    # Startup: start deadline checker in background
    task = asyncio.create_task(deadline_checker_loop())
    yield
    # Shutdown: cancel the background task
    task.cancel()


app = FastAPI(
    title="ScholarshipRight API",
    description="AI-powered scholarship discovery platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(scholarships.router, prefix="/api/scholarships", tags=["scholarships"])
app.include_router(users.router, prefix="/api/profile", tags=["profile"])
app.include_router(matches.router, prefix="/api/matches", tags=["matches"])
app.include_router(saved.router, prefix="/api/saved", tags=["saved"])
app.include_router(auth.router)
app.include_router(reminders.router, prefix="/api/reminders", tags=["reminders"])
app.include_router(resumes.router)
app.include_router(notifications_router)
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(admin_matches.router)
app.include_router(admin_overview.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_users.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_scholarships.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_audit.router, prefix="/api/admin", tags=["admin"])
# admin_invites has both /api/admin/invites/* AND /api/auth/accept-invite
# so we mount each sub-router with the right prefix.
app.include_router(admin_invites_module.admin_invites_router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_invites_module.accept_invite_router, prefix="/api/auth", tags=["auth"])


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "scholarshipright-api"}
