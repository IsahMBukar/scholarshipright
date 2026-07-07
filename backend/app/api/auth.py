"""Auth endpoints — registration, login, logout, me, password reset."""
import os
import html as _html
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field, EmailStr
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import httpx
import logging

from app.db.session import get_db
from app.models.user import User
from app.core.config import get_settings
from app.core.cookie_config import auth_cookie_kwargs
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
#
# The signing secret comes from app.core.config.Settings.jwt_secret
# (which reads the JWT_SECRET env var). Validation that the secret is non-empty,
# non-placeholder, and >=32 chars happens at app boot via _validate_security_settings
# when ENVIRONMENT=production. We read it fresh per call rather than caching
# at import time so config changes take effect without a reload.
ALGORITHM = "HS256"
COOKIE_NAME = "sr_token"
COOKIE_MAX_AGE = 86400 * 30  # 30 days

# Module-level logger for the dev-mode "email" (the reset link is logged
# here so the operator can copy it during local development).
logger = logging.getLogger("scholarshipright.auth")


# ── Schemas ──

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── Helpers ──

def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=COOKIE_MAX_AGE)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        get_settings().jwt_secret,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
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

    # Generate email confirmation token and send confirmation email
    from app.models.user import (
        generate_email_confirm_token, hash_email_confirm_token, EMAIL_CONFIRM_TTL_HOURS,
    )
    from app.services.email import send_templated_email

    confirm_token = generate_email_confirm_token()
    user.email_confirm_token_hash = hash_email_confirm_token(confirm_token)
    user.email_confirm_expires_at = datetime.now(timezone.utc) + timedelta(hours=EMAIL_CONFIRM_TTL_HOURS)
    await db.commit()

    confirm_url = f"{get_settings().frontend_url.rstrip('/')}/confirm-email?token={confirm_token}"
    await send_templated_email(
        to=email,
        template="email_confirmation",
        variables={
            "RECIPIENT_NAME": body.full_name.strip() or "Student",
            "CONFIRM_URL": confirm_url,
        },
        subject="Confirm your ScholarshipRight email",
    )

    # Send welcome email (fire-and-forget)
    await send_templated_email(
        to=email,
        template="welcome",
        variables={
            "RECIPIENT_NAME": body.full_name.strip() or "Student",
            "USER_ID": str(user.id),
            "UNSUBSCRIBE_CATEGORY": "marketing",
        },
        subject="Welcome to ScholarshipRight!",
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

    # Block login until email is confirmed
    if user.email_confirmed_at is None:
        raise HTTPException(
            403,
            {
                "code": "email_not_confirmed",
                "user_message": "Please confirm your email address before logging in.",
                "email": user.email,
            },
        )

    token = create_token(str(user.id))
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        max_age=COOKIE_MAX_AGE,
        **auth_cookie_kwargs(),
    )
    return {"id": str(user.id), "email": user.email, "full_name": user.full_name}


@router.post("/logout")
async def logout(response: Response):
    """Clear auth cookie.

    Must pass the SAME flags (httponly/samesite/secure) that the cookie
    was set with, otherwise browsers silently fail to remove it -- in
    particular a Secure flag set at create-time but missing at delete
    would leave the production cookie alive past logout.
    """
    response.delete_cookie(COOKIE_NAME, **auth_cookie_kwargs())
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
        # "local" for email/password, "google" for Google OAuth.
        "auth_provider": user.auth_provider or "local",
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
    email: EmailStr


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

    # Send password reset email via OquMail
    from app.services.email import send_templated_email
    settings = get_settings()
    reset_url = make_reset_url(settings.frontend_url, raw_token)
    await send_templated_email(
        to=user.email,
        template="password_reset",
        variables={
            "RECIPIENT_NAME": user.full_name or "Student",
            "RESET_URL": reset_url,
            "EXPIRY_MINUTES": str(RESET_TTL_MINUTES),
        },
        subject="Reset your ScholarshipRight password",
    )
    logger.info(
        "[password-reset] Email sent to %s (expires in %d min)",
        user.email, RESET_TTL_MINUTES,
    )

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


# ── Email confirmation ──────────────────────────────────────────────

class ConfirmEmailRequest(BaseModel):
    token: str


@router.post("/confirm-email")
async def confirm_email(
    body: ConfirmEmailRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Confirm a user's email address using the token from the confirmation email.

    Also sets the auth cookie so the user is auto-logged in on confirmation.
    """
    from app.models.user import hash_email_confirm_token

    raw = body.token.strip()
    if not raw:
        raise HTTPException(400, "Invalid confirmation link")

    token_hash = hash_email_confirm_token(raw)
    result = await db.execute(
        select(User).where(User.email_confirm_token_hash == token_hash)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            400,
            {"code": "invalid_token", "user_message": "This confirmation link is invalid or has expired."},
        )

    now = datetime.now(timezone.utc)
    if user.email_confirmed_at is not None:
        # Already confirmed — still set cookie (user might have cleared cookies)
        auth_token = create_token(str(user.id))
        response.set_cookie(
            key=COOKIE_NAME, value=auth_token,
            max_age=COOKIE_MAX_AGE,
            **auth_cookie_kwargs(),
        )
        return {"status": "already_confirmed", "email": user.email}

    if user.email_confirm_expires_at and user.email_confirm_expires_at <= now:
        raise HTTPException(
            400,
            {"code": "token_expired", "user_message": "This confirmation link has expired. Request a new one."},
        )

    user.email_confirmed_at = now
    user.email_confirm_token_hash = None
    user.email_confirm_expires_at = None
    await db.commit()

    # Auto-login: set auth cookie
    auth_token = create_token(str(user.id))
    response.set_cookie(
        key=COOKIE_NAME, value=auth_token,
        max_age=COOKIE_MAX_AGE,
        **auth_cookie_kwargs(),
    )

    return {"status": "confirmed", "email": user.email}


class ResendConfirmationRequest(BaseModel):
    email: str


@router.post("/resend-confirmation", dependencies=[Depends(auth_forgot_rate_limit)])
async def resend_confirmation(
    body: ResendConfirmationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Resend email confirmation link. Rate-limited same as forgot-password."""
    from app.models.user import (
        generate_email_confirm_token, hash_email_confirm_token, EMAIL_CONFIRM_TTL_HOURS,
    )
    from app.services.email import send_templated_email

    email = body.email.strip().lower()
    if not email:
        return {"status": "ok"}

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or user.email_confirmed_at is not None:
        # Don't leak whether email exists or is already confirmed
        return {"status": "ok"}

    confirm_token = generate_email_confirm_token()
    user.email_confirm_token_hash = hash_email_confirm_token(confirm_token)
    user.email_confirm_expires_at = datetime.now(timezone.utc) + timedelta(hours=EMAIL_CONFIRM_TTL_HOURS)
    await db.commit()

    confirm_url = f"{get_settings().frontend_url.rstrip('/')}/confirm-email?token={confirm_token}"
    await send_templated_email(
        to=email,
        template="email_confirmation",
        variables={
            "RECIPIENT_NAME": user.full_name or "Student",
            "CONFIRM_URL": confirm_url,
        },
        subject="Confirm your ScholarshipRight email",
    )

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
    """List recent password-reset token rows for an email. DEV ONLY.

    Returns 404 in any non-development environment. The 404 (rather than 401
    or 503) is deliberate — those status codes would still leak the existence
    of this route to a probe. 404 makes the endpoint indistinguishable from
    a typo'd URL.
    """
    if get_settings().environment != "development":
        raise HTTPException(status_code=404, detail="Not Found")

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


# ── Google OAuth ───────────────────────────────────────────────────
#
# Flow:
#   1. Frontend links to GET /api/auth/google
#   2. Backend builds Google authorization URL with CSRF state,
#      stores state in a short-lived cookie, redirects browser to Google.
#   3. User consents → Google redirects to GET /api/auth/google/callback
#   4. Backend validates state, exchanges code for tokens, fetches user
#      info, creates/links account, sets JWT cookie, redirects to frontend.
#
# Google Cloud Console setup:
#   Authorized redirect URI: http://localhost:8000/api/auth/google/callback

import secrets as _secrets
import httpx

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"


@router.get("/google")
async def google_login(request: Request):
    """Initiate Google OAuth flow. Redirects browser to Google consent screen."""
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(503, "Google sign-in is not configured")

    redirect_uri = f"{settings.server_url.rstrip('/')}/api/auth/google/callback"
    state = _secrets.token_urlsafe(32)

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    from urllib.parse import urlencode
    authorization_url = f"{GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"

    # Store CSRF state in a short-lived cookie (5 min)
    resp = RedirectResponse(url=authorization_url)
    resp.set_cookie(
        "google_oauth_state",
        value=state,
        max_age=300,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
    )
    return resp


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback. Creates/links account, sets JWT cookie, redirects to frontend."""
    settings = get_settings()
    frontend = settings.frontend_url.rstrip("/")

    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(503, "Google sign-in is not configured")

    # Check for errors from Google
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(url=f"{frontend}/login?error=google_denied")

    # Validate CSRF state
    state = request.query_params.get("state")
    saved_state = request.cookies.get("google_oauth_state")
    if not state or not saved_state or state != saved_state:
        return RedirectResponse(url=f"{frontend}/login?error=invalid_state")

    code = request.query_params.get("code")
    if not code:
        return RedirectResponse(url=f"{frontend}/login?error=google_failed")

    redirect_uri = f"{settings.server_url.rstrip('/')}/api/auth/google/callback"

    # Exchange authorization code for tokens
    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(GOOGLE_TOKEN_ENDPOINT, data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            })
            token_resp.raise_for_status()
            token_data = token_resp.json()
    except Exception as e:
        logger.warning("[google-oauth] Token exchange failed: %s", e)
        return RedirectResponse(url=f"{frontend}/login?error=google_failed")

    access_token = token_data.get("access_token")
    if not access_token:
        return RedirectResponse(url=f"{frontend}/login?error=google_failed")

    # Fetch user info from Google
    try:
        async with httpx.AsyncClient() as client:
            userinfo_resp = await client.get(
                GOOGLE_USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo_resp.raise_for_status()
            google_user = userinfo_resp.json()
    except Exception as e:
        logger.warning("[google-oauth] Failed to fetch user info: %s", e)
        return RedirectResponse(url=f"{frontend}/login?error=google_failed")

    google_sub = google_user.get("sub")  # Google's unique user ID
    email = (google_user.get("email") or "").strip().lower()
    name = google_user.get("name") or ""
    picture = google_user.get("picture") or ""

    if not email:
        return RedirectResponse(url=f"{frontend}/login?error=google_no_email")

    # ── Find or create user ──
    user = None

    # 1. Fast lookup by google_id
    if google_sub:
        result = await db.execute(select(User).where(User.google_id == google_sub))
        user = result.scalar_one_or_none()

    # 2. Fallback: lookup by email (linking existing local account)
    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            # Link existing local account to Google
            if not user.google_id:
                user.google_id = google_sub
            if not user.auth_provider:
                user.auth_provider = "google"
            # Auto-confirm email if not yet confirmed (Google verified it)
            if user.email_confirmed_at is None:
                user.email_confirmed_at = datetime.now(timezone.utc)
            await db.commit()

    # 3. Create new user if neither matched
    if not user:
        user = User(
            email=email,
            full_name=name or None,
            auth_provider="google",
            google_id=google_sub,
            email_confirmed_at=datetime.now(timezone.utc),  # Google verified
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Send welcome email (fire-and-forget)
        from app.services.email import send_templated_email
        await send_templated_email(
            to=email,
            template="welcome",
            variables={
                "RECIPIENT_NAME": name or "Student",
                "USER_ID": str(user.id),
                "UNSUBSCRIBE_CATEGORY": "marketing",
            },
            subject="Welcome to ScholarshipRight!",
        )

    if not user.is_active:
        return RedirectResponse(url=f"{frontend}/login?error=account_deactivated")

    # Set JWT cookie and redirect to frontend auth callback page
    auth_token = create_token(str(user.id))
    redirect = RedirectResponse(url=f"{frontend}/auth/callback")
    redirect.set_cookie(
        key=COOKIE_NAME,
        value=auth_token,
        max_age=COOKIE_MAX_AGE,
        **auth_cookie_kwargs(),
    )
    # Clear the state cookie
    redirect.delete_cookie("google_oauth_state")
    return redirect




# ---------------------------------------------------------------------------
# MCP OAuth 2.0 (authorization code + PKCE)
#
# ScholarshipRight IS the authorization server. MCP clients (Claude.ai,
# ChatGPT) redirect users here to authenticate with the app's own login
# form. No Scalekit consent screen.
# ---------------------------------------------------------------------------

import hashlib
import secrets as _secrets
import time
from base64 import urlsafe_b64encode
from urllib.parse import urlparse

# In-memory store for pending auth codes (code -> metadata)
# TTL: 5 minutes. Max 1000 entries to prevent memory exhaustion.
_mcp_auth_codes: dict[str, dict] = {}
_AUTH_CODE_TTL = 300  # 5 minutes
_MAX_AUTH_CODES = 1000


def _cleanup_expired_codes() -> None:
    """Remove expired auth codes from memory."""
    now = time.time()
    expired = [c for c, m in _mcp_auth_codes.items() if now > m["expires_at"]]
    for c in expired:
        _mcp_auth_codes.pop(c, None)


def _validate_redirect_uri(uri: str) -> str | None:
    """Validate redirect_uri. Returns error message or None if valid.

    Rules:
    - Must be HTTPS (except localhost for dev)
    - Must not be empty
    - Must be a valid URL
    """
    if not uri:
        return "redirect_uri is required"
    try:
        parsed = urlparse(uri)
    except Exception:
        return "redirect_uri is not a valid URL"
    if not parsed.scheme or not parsed.netloc:
        return "redirect_uri is not a valid URL"
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        return "redirect_uri must use HTTPS"
    if parsed.scheme not in ("http", "https"):
        return "redirect_uri must use HTTP or HTTPS"
    return None


def _esc(value: str) -> str:
    """HTML-escape a string for safe interpolation into templates."""
    return _html.escape(str(value), quote=True)


def _mcp_login_form_html(
    client_id: str,
    redirect_uri: str,
    response_type: str,
    state: str,
    scope: str,
    code_challenge: str,
    code_challenge_method: str,
    server_url: str,
    error: str = "",
) -> str:
    """Render the MCP OAuth login form with XSS-safe interpolation."""
    error_html = f'<div class="error">{_esc(error)}</div>' if error else ""
    esc = _esc
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — ScholarshipRight MCP</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
         sans-serif; background: #f5f5f5; display: flex;
         align-items: center; justify-content: center; min-height: 100vh; }}
  .card {{ background: #fff; padding: 40px; border-radius: 16px;
           box-shadow: 0 4px 24px rgba(0,0,0,.08); width: 100%;
           max-width: 400px; }}
  .logo {{ margin-bottom: 24px; }}
  .logo h1 {{ font-size: 22px; font-weight: 700; }}
  .logo p {{ font-size: 13px; color: #666; margin-top: 4px; }}
  .badge {{ display: inline-block; background: #eef2ff; color: #4338ca;
            font-size: 12px; font-weight: 600; padding: 4px 12px;
            border-radius: 100px; margin-bottom: 24px; }}
  label {{ display: block; font-size: 13px; font-weight: 500;
           color: #333; margin-bottom: 6px; }}
  input {{ width: 100%; padding: 10px 12px; border: 1px solid #ddd;
           border-radius: 8px; font-size: 14px; margin-bottom: 16px;
           outline: none; transition: border-color 0.2s; }}
  input:focus {{ border-color: #4a90d9; }}
  button {{ width: 100%; padding: 12px; background: #1a1a1a; color: #fff;
            border: none; border-radius: 8px; font-size: 14px;
            font-weight: 600; cursor: pointer; transition: background 0.2s; }}
  button:hover {{ background: #333; }}
  .error {{ background: #fef2f2; color: #dc2626; font-size: 13px;
            padding: 10px 14px; border-radius: 8px; margin-bottom: 16px;
            border: 1px solid #fecaca; }}
  .footer {{ text-align: center; margin-top: 20px; font-size: 12px; color: #999; }}
  .scope-info {{ background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
                 font-size: 12px; padding: 8px 12px; border-radius: 8px;
                 margin-bottom: 16px; }}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <h1>ScholarshipRight</h1>
    <p>AI Agent Authentication</p>
  </div>
  <div style="text-align:center"><span class="badge">MCP Connection</span></div>
  {error_html}
  <div class="scope-info">
    Requesting access: <strong>{esc(scope or "scholarships:read")}</strong>
  </div>
  <form method="POST" action="{esc(server_url)}/api/auth/mcp-authorize">
    <input type="hidden" name="client_id" value="{esc(client_id)}">
    <input type="hidden" name="redirect_uri" value="{esc(redirect_uri)}">
    <input type="hidden" name="response_type" value="{esc(response_type)}">
    <input type="hidden" name="state" value="{esc(state)}">
    <input type="hidden" name="scope" value="{esc(scope)}">
    <input type="hidden" name="code_challenge" value="{esc(code_challenge)}">
    <input type="hidden" name="code_challenge_method" value="{esc(code_challenge_method)}">
    <label>Email</label>
    <input type="email" name="email" placeholder="admin@example.com" required autofocus>
    <label>Password</label>
    <input type="password" name="password" placeholder="Your password" required>
    <button type="submit">Sign in &amp; Connect Agent</button>
  </form>
  <div class="footer">Only admin &amp; staff accounts can connect AI agents.</div>
</div>
</body>
</html>"""


def _get_server_url() -> str:
    """Get the public server URL for form actions and metadata."""
    return os.environ.get("MCP_OAUTH_SERVER_URL", get_settings().server_url).rstrip("/")


@router.api_route("/mcp-authorize", methods=["GET", "POST"])
async def mcp_authorize(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """OAuth 2.0 Authorization Endpoint (RFC 6749) with PKCE (RFC 7636).

    GET  -- Show the custom login form with OAuth params preserved.
    POST -- Verify credentials, generate auth code, redirect to client.
    """
    from app.core.rate_limit import mcp_authorize_rate_limit
    await mcp_authorize_rate_limit(request)

    _cleanup_expired_codes()
    server_url = _get_server_url()

    if request.method == "GET":
        client_id = request.query_params.get("client_id", "")
        redirect_uri = request.query_params.get("redirect_uri", "")
        response_type = request.query_params.get("response_type", "code")
        state = request.query_params.get("state", "")
        scope = request.query_params.get("scope", "scholarships:read")
        code_challenge = request.query_params.get("code_challenge", "")
        code_challenge_method = request.query_params.get("code_challenge_method", "")

        uri_error = _validate_redirect_uri(redirect_uri)
        if uri_error:
            return JSONResponse(status_code=400, content={"error": "invalid_request", "error_description": uri_error})
        if response_type != "code":
            return JSONResponse(status_code=400, content={"error": "unsupported_response_type", "error_description": "Only 'code' is supported"})
        if not code_challenge:
            return JSONResponse(status_code=400, content={"error": "invalid_request", "error_description": "code_challenge required (PKCE)"})

        return HTMLResponse(
            _mcp_login_form_html(
                client_id=client_id, redirect_uri=redirect_uri,
                response_type=response_type, state=state, scope=scope,
                code_challenge=code_challenge, code_challenge_method=code_challenge_method,
                server_url=server_url,
            )
        )

    # POST: verify credentials and issue auth code
    form = await request.form()
    client_id = str(form.get("client_id", ""))
    redirect_uri = str(form.get("redirect_uri", ""))
    response_type = str(form.get("response_type", "code"))
    state = str(form.get("state", ""))
    scope = str(form.get("scope", "scholarships:read"))
    code_challenge = str(form.get("code_challenge", ""))
    code_challenge_method = str(form.get("code_challenge_method", ""))
    email = str(form.get("email", "")).strip().lower()
    password = str(form.get("password", ""))

    uri_error = _validate_redirect_uri(redirect_uri)
    if uri_error:
        return JSONResponse(status_code=400, content={"error": "invalid_request", "error_description": uri_error})

    def _form_error(msg, status_code=400):
        return HTMLResponse(
            _mcp_login_form_html(
                client_id, redirect_uri, response_type, state,
                scope, code_challenge, code_challenge_method,
                server_url=server_url, error=msg,
            ),
            status_code=status_code,
        )

    if not email or not password:
        return _form_error("Email and password are required.")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        return _form_error("Invalid email or password.", 401)
    if not verify_password(password, user.password_hash):
        return _form_error("Invalid email or password.", 401)
    if not user.is_active:
        return _form_error("Account is deactivated.", 403)
    if not getattr(user, "is_admin", False):
        return _form_error("Only admin and staff members can connect AI agents.", 403)

    # Enforce cap on stored auth codes
    if len(_mcp_auth_codes) >= _MAX_AUTH_CODES:
        _cleanup_expired_codes()
        if len(_mcp_auth_codes) >= _MAX_AUTH_CODES:
            logger.error("MCP auth codes at capacity (%d), rejecting", _MAX_AUTH_CODES)
            return _form_error("Server busy. Please try again in a moment.", 503)

    auth_code = _secrets.token_urlsafe(32)
    _mcp_auth_codes[auth_code] = {
        "user_id": str(user.id),
        "email": user.email,
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "expires_at": time.time() + _AUTH_CODE_TTL,
    }

    logger.info("MCP OAuth: auth code issued for user=%s client=%s scope=%s", email, client_id, scope)

    separator = "&" if "?" in redirect_uri else "?"
    callback = f"{redirect_uri}{separator}code={auth_code}"
    if state:
        callback += f"&state={state}"
    return RedirectResponse(url=callback, status_code=302)


@router.post("/mcp-token")
async def mcp_token(request: Request):
    """OAuth 2.0 Token Endpoint (RFC 6749) with PKCE (RFC 7636)."""
    from app.core.rate_limit import mcp_token_rate_limit
    await mcp_token_rate_limit(request)

    _cleanup_expired_codes()

    form = await request.form()
    grant_type = str(form.get("grant_type", ""))
    code = str(form.get("code", ""))
    redirect_uri = str(form.get("redirect_uri", ""))
    client_id = str(form.get("client_id", ""))
    code_verifier = str(form.get("code_verifier", ""))

    if grant_type != "authorization_code":
        return JSONResponse(status_code=400, content={"error": "unsupported_grant_type", "error_description": "Only authorization_code is supported"})

    if not code or code not in _mcp_auth_codes:
        return JSONResponse(status_code=400, content={"error": "invalid_grant", "error_description": "Invalid or expired authorization code"})

    code_data = _mcp_auth_codes.pop(code)

    if code_data["redirect_uri"] != redirect_uri:
        return JSONResponse(status_code=400, content={"error": "invalid_grant", "error_description": "redirect_uri mismatch"})

    if code_data.get("code_challenge"):
        computed_challenge = (
            urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest())
            .rstrip(b"=").decode("ascii")
        )
        if computed_challenge != code_data["code_challenge"]:
            return JSONResponse(status_code=400, content={"error": "invalid_grant", "error_description": "PKCE verification failed"})

    settings = get_settings()
    now = datetime.now(timezone.utc)
    scope = code_data.get("scope", "scholarships:read")
    server_url = _get_server_url()

    token_payload = {
        "sub": code_data["user_id"],
        "email": code_data["email"],
        "client_id": code_data.get("client_id", "mcp-client"),
        "scope": scope,
        "iss": server_url,
        "aud": os.environ.get("MCP_OAUTH_AUDIENCE", server_url),
        "iat": int(now.timestamp()),
        "exp": int(now.timestamp()) + 3600,
    }
    access_token = jwt.encode(token_payload, settings.jwt_secret, algorithm=ALGORITHM)

    logger.info("MCP OAuth: token issued for user=%s scope=%s", code_data["email"], scope)

    return JSONResponse(content={
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": scope,
    })


@router.post("/mcp-register")
async def mcp_register(request: Request):
    """Dynamic Client Registration (RFC 7591).

    Accepts registration but validates redirect_uris.
    """
    from app.core.rate_limit import mcp_register_rate_limit
    await mcp_register_rate_limit(request)

    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}

    redirect_uris = body.get("redirect_uris", [])
    if not isinstance(redirect_uris, list):
        return JSONResponse(status_code=400, content={"error": "invalid_client_metadata", "error_description": "redirect_uris must be a list"})

    for uri in redirect_uris:
        err = _validate_redirect_uri(uri)
        if err:
            return JSONResponse(status_code=400, content={"error": "invalid_client_metadata", "error_description": f"Invalid redirect_uri: {err}"})

    client_id = _secrets.token_urlsafe(16)
    logger.info("MCP OAuth: client registered client_id=%s name=%s", client_id, body.get("client_name", "unknown"))

    return JSONResponse(
        status_code=201,
        content={
            "client_id": client_id,
            "client_id_issued_at": int(time.time()),
            "grant_types": ["authorization_code"],
            "response_types": ["code"],
            "redirect_uris": redirect_uris,
            "token_endpoint_auth_method": "none",
        },
    )
