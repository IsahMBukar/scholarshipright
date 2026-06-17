"""Auth endpoints — registration, login, logout, me."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, Field
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import os

from app.db.session import get_db
from app.models.user import User
from app.core.rate_limit import (
    auth_invite_rate_limit,
    auth_login_rate_limit,
    auth_register_rate_limit,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT config
SECRET_KEY = os.getenv("JWT_SECRET", "scholarshipright-dev-secret-change-in-production")
ALGORITHM = "HS256"
COOKIE_NAME = "sr_token"
COOKIE_MAX_AGE = 86400 * 30  # 30 days


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
