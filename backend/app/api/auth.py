"""Auth endpoints — registration, login, logout, me."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import os

from app.db.session import get_db
from app.models.user import User
from app.core.rate_limit import auth_rate_limit

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

@router.post("/register", dependencies=[Depends(auth_rate_limit)])
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


@router.post("/login", dependencies=[Depends(auth_rate_limit)])
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
