"""Auth endpoints — registration, login, logout, me, password reset."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, Field
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import logging
import os

from app.db.session import get_db
from app.models.user import User
from app.core.config import get_settings
from app.core.rate_limit import (
    auth_forgot_rate_limit,
    auth_invite_rate_limit,
    auth_login_rate_limit,
    auth_register_rate_limit,
    auth_reset_rate_limit,
)
from app.models.password_reset import (
    PasswordResetToken,
    RESET_TTL_MINUTES,
    generate_token,
    hash_token,
    make_reset_url,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT config
SECRET_KEY = os.getenv("JWT_SECRET", "scholarshipright-dev-secret-change-in-production")
ALGORITHM = "HS256"
COOKIE_NAME = "sr_token"
COOKIE_MAX_AGE = 86400 * 30  # 30 days

# Module-level logger for the dev-mode "email" (the reset link is logged
# here so the operator can copy it during local development).
logger = logging.getLogger("scholarshipright.auth")


# ── Schemas ──

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


# ── Helpers ──

def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=COOKIE_MAX_AGE)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── Endpoints ──

@router.post("/register", dependencies=[Depends(auth_register_rate_limit)])
async def register(body: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Register a new user with email + password."""
    email = body.email.strip().lower()
    if not email or not body.password:
        raise HTTPException(400, "Email and password are required")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    # Check existing
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Email already registered")

    user = User(
        email=email,
        full_name=body.full_name.strip() if body.full_name else None,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_token(str(user.id))
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        httponly=True, samesite="lax", max_age=COOKIE_MAX_AGE,
    )
    return {"id": str(user.id), "email": user.email, "full_name": user.full_name}


@router.post("/login", dependencies=[Depends(auth_login_rate_limit)])
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Login with email + password."""
    email = body.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise HTTPException(401, "Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")

    token = create_token(str(user.id))
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        httponly=True, samesite="lax", max_age=COOKIE_MAX_AGE,
    )
    return {"id": str(user.id), "email": user.email, "full_name": user.full_name}


@router.post("/logout")
async def logout(response: Response):
    """Clear auth cookie."""
    response.delete_cookie(COOKIE_NAME)
    return {"status": "logged_out"}


@router.get("/me")
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    """Get current user info from cookie token."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Not logged in")

    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(401, "Invalid or expired token")

    from uuid import UUID
    try:
        result = await db.execute(select(User).where(User.id == UUID(user_id)))
    except Exception:
        raise HTTPException(401, "Invalid user")

    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "User not found")

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": bool(user.is_admin),
        "admin_role": user.admin_role,
        # `has_password` is false for users created via magic-link
        # invitation (the password is set during accept-invite) AND for
        # future OAuth/SSO users who haven't set a password yet. The
        # /settings UI uses this to decide whether to show "Set password"
        # or "Change password".
        "has_password": bool(user.password_hash),
    }


# ── Set / change password ─────────────────────────────────────────


class SetPasswordRequest(BaseModel):
    # Required if the user already has a password (changing it).
    # Omitted when a user is setting a password for the first time
    # (e.g. after accepting an invite without a password, or a future
    # Google OAuth user).
    current_password: Optional[str] = None
    # Always required. Min 8 chars (matches accept-invite policy).
    new_password: str = Field(..., min_length=8, max_length=128)


@router.post("/set-password", dependencies=[Depends(auth_invite_rate_limit)])
async def set_password(
    body: SetPasswordRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Set or change the current user's password.

    Two cases:
      1. User has NO password (OAuth, future flow): just send new_password.
      2. User HAS a password (current flow): must send current_password too,
         and it must verify.

    Returns 200 with the updated user identity (same shape as /api/auth/me).
    """
    token = request.cookies.get(COOKIE_NAME)
    user_id = decode_token(token) if token else None
    if not user_id:
        raise HTTPException(401, "Not logged in")
    from uuid import UUID
    try:
        result = await db.execute(select(User).where(User.id == UUID(user_id)))
    except Exception:
        raise HTTPException(401, "Invalid user")
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "User not found")
    if not user.is_active:
        raise HTTPException(403, "Account is deactivated")

    has_pw = bool(user.password_hash)
    if has_pw:
        # Changing an existing password — current_password is required and must match.
        if not body.current_password:
            raise HTTPException(
                400,
                {"code": "current_password_required",
                 "user_message": "Enter your current password to set a new one."},
            )
        if not verify_password(body.current_password, user.password_hash):
            raise HTTPException(
                401,
                {"code": "current_password_wrong",
                 "user_message": "Current password is incorrect."},
            )
    # else: setting a password for the first time (OAuth) — no current needed.

    user.password_hash = hash_password(body.new_password)
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": bool(user.is_admin),
        "admin_role": user.admin_role,
        "has_password": bool(user.password_hash),
    }


# ── Dev login (keep for backward compat) ──

@router.post("/dev-login")
async def dev_login(response: Response, db: AsyncSession = Depends(get_db)):
    """Dev-only login — finds or creates test user."""
    from uuid import UUID
    dev_email = "test@scholarshipright.com"

    result = await db.execute(select(User).where(User.email == dev_email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(email=dev_email, full_name="Test User", password_hash=hash_password("dev123"))
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_token(str(user.id))
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        httponly=True, samesite="lax", max_age=COOKIE_MAX_AGE,
    )
    return {"id": str(user.id), "email": user.email, "full_name": user.full_name}


# ── Password reset ────────────────────────────────────────────────
#
# Flow:
#   1. User hits "Forgot password?" on /login → POST /forgot-password
#      with their email. We:
#        - Always return 200 (don't leak which emails exist)
#        - If the email is registered: invalidate any prior unused tokens
#          for that user, create a fresh 1-hour token, hash+store it, and
#          log the reset link to the backend console (the dev-mode "email").
#        - If the email is not registered: return 200 anyway, no log.
#   2. User clicks the link → /reset-password?token=...  → POST
#      /reset-password with {token, new_password}. We hash the inbound
#      token, look it up, verify not expired + not used, then update
#      the password and mark the row used.
#
# Production note:
#   To wire a real email service (SendGrid / Resend / SMTP), swap the
#   logger.info(...) call below for an `await email_service.send(...)`
#   call. The DB token + lookup is already production-ready.


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    # Matches the policy used by /set-password and /register.
    new_password: str = Field(..., min_length=8, max_length=128)


@router.post("/forgot-password", dependencies=[Depends(auth_forgot_rate_limit)])
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Request a password-reset link. Always returns 200 to prevent email enumeration.

    If the email is registered, a 1-hour single-use token is created and
    the reset link is logged to the backend console (dev-mode "email").
    """
    email = body.email.strip().lower()
    if not email:
        # Even invalid input returns 200 with the same shape — we never
        # leak whether the email was syntactically valid.
        return {"status": "ok"}

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        # Don't disclose non-existence. Don't log either — that's the
        # only side effect, and an attacker could use timing/log noise
        # to enumerate.
        return {"status": "ok"}

    if not user.is_active:
        # Deactivated accounts get the same response but no link is sent.
        # Don't disclose the deactivation.
        return {"status": "ok"}

    # Invalidate any prior unused tokens for this user so only the most
    # recent link works. (Otherwise a leaked old link would survive.)
    now = datetime.now(timezone.utc)
    prior = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.invalidated_at.is_(None),
        )
    )
    for old in prior.scalars().all():
        old.invalidated_at = now

    # Create the new token. Raw token goes to the email/log; only the
    # hash is persisted.
    raw_token = generate_token()
    token_row = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=now + timedelta(minutes=RESET_TTL_MINUTES),
    )
    db.add(token_row)
    await db.commit()

    # Dev-mode "email" — the operator copies the link from the terminal.
    # Replace with `await email_service.send(...)` to wire a real service.
    settings = get_settings()
    reset_url = make_reset_url(settings.frontend_url, raw_token)
    logger.info(
        "[password-reset] Send to %s (expires in %d min): %s",
        user.email, RESET_TTL_MINUTES, reset_url,
    )
    # Also print to stdout so it shows up in `docker logs` / Proot
    # backgrounded-process output, which is the common dev workflow.
    print(f"[password-reset] {user.email} → {reset_url}")

    # In dev mode, surface the raw token + reset URL in the response so
    # the E2E test (and the /forgot-password page) can grab it without
    # scraping server logs. The /reset-password page renders this link
    # as a clickable affordance in non-prod environments.
    #
    # Gated by the DEV_RETURN_RESET_TOKEN env var (loaded via
    # pydantic-settings so it works the same in dev and prod). In
    # production, leave it unset (or "0") and the response is the same
    # generic {status:ok} shape as a non-registered email.
    response_body: dict = {"status": "ok"}
    if settings.dev_return_reset_token == "1":
        response_body["dev_reset_url"] = reset_url
        response_body["dev_reset_token"] = raw_token
    return response_body


@router.post("/reset-password", dependencies=[Depends(auth_reset_rate_limit)])
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Consume a password-reset token and set a new password.

    The token is hashed and looked up. We require:
      - Token row exists
      - Not expired
      - Not previously used
      - Not invalidated (e.g. by a newer /forgot-password request)
    """
    raw = body.token.strip()
    if not raw:
        raise HTTPException(400, "Invalid reset link")
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    token_hash = hash_token(raw)
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    token_row = result.scalar_one_or_none()

    if not token_row:
        # No such row — generic 400 (don't leak whether the token was
        # ever issued, expired, used, or invalid).
        raise HTTPException(
            400,
            {"code": "invalid_token", "user_message": "This reset link is invalid or has expired."},
        )

    now = datetime.now(timezone.utc)
    if token_row.used_at is not None:
        raise HTTPException(
            400,
            {"code": "token_used", "user_message": "This reset link has already been used."},
        )
    if token_row.invalidated_at is not None:
        raise HTTPException(
            400,
            {"code": "token_invalidated", "user_message": "This reset link is no longer valid. Please request a new one."},
        )
    if token_row.expires_at <= now:
        raise HTTPException(
            400,
            {"code": "token_expired", "user_message": "This reset link has expired. Please request a new one."},
        )

    # Look up the user. (Should always exist — cascade delete would
    # also remove the token row, but the FK is defensive.)
    user_result = await db.execute(select(User).where(User.id == token_row.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(400, "This reset link is no longer valid.")

    user.password_hash = hash_password(body.new_password)
    user.updated_at = now
    # Mark the row used. We deliberately do NOT invalidate all the
    # user's other tokens here — they're already expired/invalidated
    # or unused, and the user might be mid-multi-device-reset.
    token_row.used_at = now
    await db.commit()

    return {"status": "ok"}


# ── Dev helper: list recent unused reset-token rows for an email.
#
# Diagnostic only — does NOT return the raw token (that's hashed at
# rest and unrecoverable). The E2E test suite gets the raw token from
# the /forgot-password response when DEV_RETURN_RESET_TOKEN=1 is set.
# This endpoint is useful for the operator to inspect via curl that
# tokens are being created/expired/used as expected.
@router.get("/dev/reset-tokens")
async def dev_get_reset_tokens(
    email: str = Query(..., min_length=3, max_length=255),
    db: AsyncSession = Depends(get_db),
):
    """List recent password-reset token rows for an email. DEV ONLY."""
    email = email.strip().lower()
    now = datetime.now(timezone.utc)

    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if not user:
        return {"tokens": []}

    tokens_result = await db.execute(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id)
        .order_by(PasswordResetToken.created_at.desc())
        .limit(5)
    )
    rows = tokens_result.scalars().all()

    return {
        "tokens": [
            {
                "id": str(r.id),
                "created_at": r.created_at.isoformat(),
                "expires_at": r.expires_at.isoformat(),
                "used_at": r.used_at.isoformat() if r.used_at else None,
                "invalidated_at": r.invalidated_at.isoformat() if r.invalidated_at else None,
                "expired": r.expires_at <= now,
            }
            for r in rows
        ]
    }
