"""
Admin invite service — create, list, revoke, accept.

Email sending is stubbed for now: the magic-link URL is logged to the
console and returned in the API response. When RESEND_API_KEY is set
in production, switch the stub for the real Resend call.
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_invite import (
    INVITE_TTL_DAYS,
    AdminInvite,
    generate_token,
    hash_token,
    make_invite_url,
)
from app.models.user import User

logger = logging.getLogger(__name__)


# ── Stub email sender ──────────────────────────────────────────────


async def _send_invite_email(to_email: str, invite_url: str, invited_by_email: Optional[str], note: Optional[str]) -> bool:
    """Send the invite email. Returns True if sent (or stubbed), False on error.

    In dev (no RESEND_API_KEY) we log the URL and return True. In production
    the operator should set RESEND_API_KEY and the function should switch
    to using `import resend` + `resend.Emails.send(...)`.
    """
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        logger.warning(
            "[INVITE EMAIL STUB] To: %s | From: %s | Note: %r | URL: %s",
            to_email,
            invited_by_email or "system",
            note,
            invite_url,
        )
        return True

    # Production path — uncomment + customize when RESEND_API_KEY is set
    try:
        import resend
        resend.api_key = api_key
        resend.Emails.send({
            "from": "ScholarshipRight <noreply@scholarshipright.com>",
            "to": to_email,
            "subject": f"You've been invited to help run ScholarshipRight",
            "html": (
                f"<p>Hi,</p>"
                f"<p>{invited_by_email or 'A team member'} has invited you to be a "
                f"<strong>ScholarshipRight admin</strong>.</p>"
                + (f"<p>Note: {note}</p>" if note else "")
                + f"<p>Click the link below to accept (valid for {INVITE_TTL_DAYS} days):</p>"
                f"<p><a href='{invite_url}'>{invite_url}</a></p>"
            ),
        })
        return True
    except Exception as e:  # noqa: BLE001
        logger.exception("Failed to send invite email: %s", e)
        return False


# ── Public service functions ──────────────────────────────────────


async def create_invite(
    db: AsyncSession,
    *,
    email: str,
    admin_role: str,
    invited_by_user: User,
    note: Optional[str] = None,
    base_url: Optional[str] = None,
) -> tuple[AdminInvite, str]:
    """Create a new invite and return (row, raw_token).

    The raw token is shown ONCE here and is embedded in the magic link
    URL. It is never stored in the DB (we store the SHA256 hash).
    """
    if admin_role not in ("super_admin", "support_staff"):
        raise ValueError(f"Invalid admin_role: {admin_role}")
    if "@" not in email:
        raise ValueError("Invalid email")

    raw_token = generate_token()
    now = datetime.now(timezone.utc)
    invite = AdminInvite(
        email=email.strip().lower(),
        admin_role=admin_role,
        token_hash=hash_token(raw_token),
        invited_by=invited_by_user.id,
        invited_by_email=invited_by_user.email,
        note=note,
        created_at=now,
        expires_at=now + timedelta(days=INVITE_TTL_DAYS),
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    # Build URL and (attempt to) send
    if not base_url:
        base_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    url = make_invite_url(base_url, raw_token)
    await _send_invite_email(invite.email, url, invited_by_user.email, note)

    return invite, raw_token


async def list_invites(
    db: AsyncSession,
    *,
    page: int = 1,
    limit: int = 50,
    include_accepted: bool = False,
    include_revoked: bool = False,
) -> tuple[list[AdminInvite], int]:
    """List invites newest-first with optional filtering of terminal states."""
    q = select(AdminInvite)
    if not include_accepted:
        q = q.where(AdminInvite.accepted_at.is_(None))
    if not include_revoked:
        q = q.where(AdminInvite.revoked_at.is_(None))

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one() or 0
    rows = (await db.execute(
        q.order_by(AdminInvite.created_at.desc())
        .offset((page - 1) * limit).limit(limit)
    )).scalars().all()
    return list(rows), int(total)


async def revoke_invite(
    db: AsyncSession,
    *,
    invite_id: UUID,
    revoked_by_user: User,
) -> Optional[AdminInvite]:
    inv = (await db.execute(select(AdminInvite).where(AdminInvite.id == invite_id))).scalar_one_or_none()
    if not inv:
        return None
    if inv.accepted_at is not None:
        return inv  # noop — already accepted, can't revoke
    if inv.revoked_at is not None:
        return inv  # already revoked
    inv.revoked_at = datetime.now(timezone.utc)
    inv.revoked_by = revoked_by_user.id
    await db.commit()
    await db.refresh(inv)
    return inv


async def accept_invite(
    db: AsyncSession,
    *,
    raw_token: str,
    full_name: Optional[str] = None,
) -> tuple[Optional[User], Optional[AdminInvite], str]:
    """Look up an invite by token, validate, and create-or-promote the user.

    Returns (user_or_None, invite_or_None, status):
        status: "accepted" | "expired" | "revoked" | "already_accepted" | "not_found"
    The user is committed to the DB on success.
    """
    if not raw_token:
        return None, None, "not_found"
    h = hash_token(raw_token)
    inv = (await db.execute(
        select(AdminInvite).where(AdminInvite.token_hash == h)
    )).scalar_one_or_none()
    if not inv:
        return None, None, "not_found"
    if inv.accepted_at is not None:
        return None, inv, "already_accepted"
    if inv.revoked_at is not None:
        return None, inv, "revoked"
    if inv.expires_at < datetime.now(timezone.utc):
        return None, inv, "expired"

    # Find or create the user by email
    email = inv.email.strip().lower()
    u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not u:
        u = User(email=email, full_name=full_name or email.split("@")[0])
        db.add(u)
        await db.flush()
    else:
        if full_name and not u.full_name:
            u.full_name = full_name

    # Promote to admin
    u.is_admin = True
    u.admin_role = inv.admin_role
    u.is_active = True
    u.updated_at = datetime.now(timezone.utc)

    inv.accepted_at = datetime.now(timezone.utc)
    inv.accepted_by = u.id

    await db.commit()
    await db.refresh(u)
    await db.refresh(inv)
    return u, inv, "accepted"
