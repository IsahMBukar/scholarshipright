"""
Admin module — runtime schema migration + FastAPI dependencies for admin auth.

`ensure_admin_schema_columns` runs idempotent ALTER TABLE statements on
startup so the admin columns are added to existing `users` tables
without needing a full migration. Pairs with `require_admin` /
`require_super_admin` dependencies used by `/api/admin/*` routes.
"""
import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy import text

from app.db.session import engine
from app.models.user import User
from app.api.users import get_current_user

logger = logging.getLogger(__name__)


# ── Runtime schema migration ──────────────────────────────────────


async def ensure_admin_schema_columns() -> None:
    """Add the `is_admin` and `admin_role` columns to the `users` table
    if they don't already exist.

    Idempotent: safe to run on every startup. Pairs with the User model
    in `app/models/user.py`.
    """
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role VARCHAR(20)"))
            # Index on admin_role for fast admin-only queries.
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_admin_role ON users (admin_role)"))
    except Exception as e:  # noqa: BLE001
        logger.exception("ensure_admin_schema_columns failed: %s", e)
        # Never crash startup — admin routes will just 403 if the columns
        # somehow don't exist.


# ── Auth dependencies ──────────────────────────────────────────────


def require_admin(user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: 403 unless the current user has `is_admin=True`.

    Use on any `/api/admin/*` route. Returns the User so the route
    handler can read `user.admin_role` for fine-grained checks.
    """
    if not getattr(user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "not_admin",
                "user_message": "You need admin access to use this feature.",
                "retryable": False,
            },
        )
    return user


def require_super_admin(user: User = Depends(require_admin)) -> User:
    """FastAPI dependency: 403 unless the current user is a `super_admin`.

    Use on destructive admin routes (hard delete, role changes, invite).
    """
    if getattr(user, "admin_role", None) != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "super_admin_required",
                "user_message": "Only super admins can perform this action.",
                "retryable": False,
            },
        )
    return user


def admin_role(user: User) -> Optional[str]:
    """Return the admin role string, or None if not an admin.

    Use inside route handlers to gate destructive ops:
        if admin_role(current_user) != "super_admin":
            raise HTTPException(403, ...)
    """
    if not getattr(user, "is_admin", False):
        return None
    return getattr(user, "admin_role", None) or None
