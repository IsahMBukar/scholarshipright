import asyncio
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import get_settings
from app.core.rate_limit import init_redis_url, probe_redis
from app.api import scholarships, users, matches, saved, reminders, auth, resumes, agent
from app.api import admin_matches
from app.api import admin_overview
from app.api import admin_users
from app.api import admin_scholarships
from app.api import admin_audit
from app.api import admin_invites as admin_invites_module
from app.api.notifications import router as notifications_router
from app.api.preferences import router as preferences_router
from app.api.unsubscribe import router as unsubscribe_router
from app.services.deadline_checker import deadline_checker_loop
from app.services.weekly_digest import weekly_digest_loop
from app.services.match_auto import ensure_schema_columns
from app.core.admin import ensure_admin_schema_columns
from app.models.admin_audit import ensure_audit_schema_columns
from app.models.admin_invite import ensure_invites_schema_columns
from app.models.password_reset import ensure_password_reset_schema_columns
from app.models.user import ensure_email_confirm_columns
from app.models.notification_preference import ensure_notification_preference_columns
from app.models.profile import ensure_profile_schema_columns
from app.models.scholarship import (
    ensure_scholarship_schema_columns,
    ensure_required_documents_schema_columns,
)

settings = get_settings()
logger = logging.getLogger("scholarshipright.startup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the Redis-backed rate limiter (falls back to in-memory
    # silently if Redis is unreachable — see rate_limit.py).
    init_redis_url(settings.redis_url)

    # Startup: ensure the new match-recompute columns exist (idempotent).
    try:
        await ensure_schema_columns()
    except Exception as e:  # noqa: BLE001
        # Don't crash the app for a migration problem — log loudly.
        logger.exception("ensure_schema_columns failed: %s", e)

    # Startup: ensure the admin columns exist (idempotent).
    try:
        await ensure_admin_schema_columns()
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_admin_schema_columns failed: %s", e)

    # Startup: ensure the admin_audit_log table exists (idempotent).
    try:
        await ensure_audit_schema_columns()
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_audit_schema_columns failed: %s", e)

    # Startup: ensure the admin_invites table exists (idempotent).
    try:
        await ensure_invites_schema_columns()
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_invites_schema_columns failed: %s", e)

    # Startup: ensure the accepted_english_tests column exists on
    # scholarships (idempotent). Pairs with the Scholarship model.
    try:
        await ensure_scholarship_schema_columns()
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_scholarship_schema_columns failed: %s", e)

    # Startup: ensure the prior_studies_in_english column exists on
    # profiles (idempotent). Pairs with the Profile model. Pairs with
    # the English-language waiver logic in match_engine.english_test_score.
    try:
        await ensure_profile_schema_columns()
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_profile_schema_columns failed: %s", e)

    # Startup: ensure the 14 required-documents columns exist on
    # scholarships (idempotent). Pairs with the Scholarship model.
    # See app/models/scholarship.py::_REQUIRED_DOC_COLUMNS.
    try:
        await ensure_required_documents_schema_columns()
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_required_documents_schema_columns failed: %s", e)

    # Startup: ensure the password_reset_tokens table exists (idempotent).
    try:
        await ensure_password_reset_schema_columns()
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_password_reset_schema_columns failed: %s", e)

    # Startup: ensure email confirmation columns exist on users (idempotent).
    try:
        await ensure_email_confirm_columns()
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_email_confirm_columns failed: %s", e)

    # Startup: ensure notification_preferences table exists (idempotent).
    try:
        await ensure_notification_preference_columns()
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_notification_preference_columns failed: %s", e)

    # Startup: start deadline checker in background
    deadline_task = asyncio.create_task(deadline_checker_loop())
    # Startup: start weekly digest in background
    digest_task = asyncio.create_task(weekly_digest_loop())
    yield
    # Shutdown: cancel background tasks
    deadline_task.cancel()
    digest_task.cancel()


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
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
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
app.include_router(preferences_router, prefix="/api/preferences", tags=["preferences"])
app.include_router(unsubscribe_router, prefix="/api/unsubscribe", tags=["unsubscribe"])
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
    rl_info = await probe_redis()
    return {
        "status": "ok",
        "service": "scholarshipright-api",
        "rate_limit_backend": rl_info.get("rate_limit_backend", "unknown"),
    }
