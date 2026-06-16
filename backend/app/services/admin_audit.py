"""
Admin audit writer — single helper used by all admin write endpoints.

Contract:
- `log_admin_action(...)` is async, never raises, and never blocks
  the user-facing request (it's awaited inline so the audit is
  durable before the response is sent, but if it fails we just log
  to stderr and continue).
- Use the same AsyncSessionLocal as the rest of the app, so the
  audit row is in the same DB transaction boundary as the write
  (caller's choice — pass `db=session` to use the request's
  session, or omit it to use a fresh one).
"""
import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.admin_audit import AdminAuditLog

logger = logging.getLogger(__name__)


async def log_admin_action(
    db: AsyncSession,
    admin_id: Optional[UUID],
    admin_email: Optional[str],
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    """Write a row to admin_audit_log. Never raises.

    The caller passes their `db` (the request's session) so the
    audit row is written in the same transaction as the action
    being audited. If anything goes wrong, we log and continue.
    """
    try:
        entry = AdminAuditLog(
            admin_id=admin_id,
            admin_email=admin_email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
        )
        db.add(entry)
        await db.flush()
    except Exception as e:  # noqa: BLE001
        # Audit must never break the user request. Log loudly.
        logger.exception("admin audit log failed: action=%s target=%s err=%s", action, target_id, e)
