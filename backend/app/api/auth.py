"""Simple dev auth — no Supabase needed for development."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
import json

from app.db.session import get_db
from app.models.user import User

router = APIRouter()

DEV_USER_ID = "8012a864-0315-4dc8-9809-90844656aad5"
DEV_COOKIE_NAME = "sr_dev_user"


@router.post("/dev-login")
async def dev_login(response: Response):
    """Dev-only login — sets a cookie with the test user ID."""
    response.set_cookie(
        key=DEV_COOKIE_NAME,
        value=DEV_USER_ID,
        httponly=False,
        samesite="lax",
        max_age=86400 * 30,  # 30 days
    )
    return {"status": "logged_in", "user_id": DEV_USER_ID, "email": "test@scholarshipright.com"}


@router.post("/dev-logout")
async def dev_logout(response: Response):
    """Dev-only logout."""
    response.delete_cookie(DEV_COOKIE_NAME)
    return {"status": "logged_out"}


@router.get("/me")
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    """Get current dev user info."""
    user_id = request.cookies.get(DEV_COOKIE_NAME)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in. Call POST /api/auth/dev-login first.")

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return {"id": str(user.id), "email": user.email, "full_name": user.full_name}
