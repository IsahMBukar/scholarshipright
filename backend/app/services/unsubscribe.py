"""Unsubscribe token generation and verification.

Uses HMAC-SHA256 to create signed tokens that prove a user owns an email
address — without requiring login. Each token encodes (user_id, category)
and is valid indefinitely (no expiry — unsubscribe is a right, not a session).

Categories map to notification_preferences columns:
    new_matches        → email_new_matches
    match_improvements → email_match_improvements
    deadline_reminders → email_deadline_reminders
    weekly_digest      → email_weekly_digest
    marketing          → email_marketing
    all                → all of the above
"""

from __future__ import annotations

import hashlib
import hmac
import base64
from typing import Optional

# Valid categories (must match notification_preferences columns)
CATEGORY_MAP = {
    "new_matches": "email_new_matches",
    "match_improvements": "email_match_improvements",
    "deadline_reminders": "email_deadline_reminders",
    "weekly_digest": "email_weekly_digest",
    "marketing": "email_marketing",
}
ALL_CATEGORIES = list(CATEGORY_MAP.keys())

VALID_CATEGORIES = set(CATEGORY_MAP.keys()) | {"all"}


def _get_secret() -> str:
    from app.core.config import get_settings
    secret = get_settings().jwt_secret
    if not secret:
        # Dev fallback — still functional, just less secure
        return "dev-unsubscribe-secret"
    return secret


def generate_unsubscribe_token(user_id: str, category: str) -> str:
    """Create a signed token for an unsubscribe link.

    Token format: base64(user_id:category:hmac)
    """
    if category not in VALID_CATEGORIES:
        raise ValueError(f"Invalid category: {category}")

    payload = f"{user_id}:{category}"
    secret = _get_secret().encode()
    signature = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()[:32]
    token_raw = f"{payload}:{signature}"
    return base64.urlsafe_b64encode(token_raw.encode()).decode()


def verify_unsubscribe_token(token: str) -> Optional[tuple[str, str]]:
    """Verify an unsubscribe token. Returns (user_id, category) or None."""
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        parts = decoded.split(":")
        if len(parts) != 3:
            return None

        user_id, category, provided_sig = parts
        if category not in VALID_CATEGORIES:
            return None

        # Verify HMAC
        payload = f"{user_id}:{category}"
        secret = _get_secret().encode()
        expected_sig = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()[:32]

        if not hmac.compare_digest(provided_sig, expected_sig):
            return None

        return user_id, category
    except Exception:
        return None
