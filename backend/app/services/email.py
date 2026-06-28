"""
Email service for ScholarshipRight.

Sends HTML emails via OquMail HTTP API. Fails silently in dev (logs only)
so existing dev flow isn't broken.

Usage:
    from app.services.email import send_email, send_templated_email

    # Simple send
    await send_email("user@example.com", "Subject", "<h1>Hi</h1>")

    # Template-based send
    await send_templated_email(
        to="user@example.com",
        template="welcome",
        variables={"RECIPIENT_NAME": "Alice"},
        subject="Welcome to ScholarshipRight!",
    )
"""
from __future__ import annotations

import json
import logging
import re
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

logger = logging.getLogger("scholarshipright.email")

TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "emails"
OQUMAIL_API = "https://api.oqumail.com/api/v1/emails"

FROM_NAME = "ScholarshipRight Team"
FROM_EMAIL = "hello@scholarshipright.com"


def _html_to_plain(html: str) -> str:
    """Strip HTML to plain text fallback."""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _load_template(name: str) -> Optional[str]:
    """Load an HTML template by name (without .html extension)."""
    path = TEMPLATES_DIR / f"{name}.html"
    if not path.exists():
        logger.error("Email template not found: %s (looked in %s)", name, TEMPLATES_DIR)
        return None
    return path.read_text(encoding="utf-8")


def _fill_template(html: str, variables: dict[str, str]) -> str:
    """Replace {{KEY}} placeholders with values."""
    for key, value in variables.items():
        html = html.replace("{{" + key + "}}", str(value))
    return html


def _get_api_key() -> str:
    """Load OquMail API key from Settings (env var / .env)."""
    from app.core.config import get_settings
    key = get_settings().oqumail_api_key or ""
    if key and len(key) > 20:
        return key
    return ""


def send_email_sync(
    to: str | list[str],
    subject: str,
    html: str,
    from_name: str = FROM_NAME,
    unsubscribe_url: str | None = None,
) -> dict:
    """Send an email synchronously via OquMail HTTP API.

    Returns {"success": True, "id": ...} or {"success": False, "error": ...}.
    """
    api_key = _get_api_key()
    if not api_key:
        logger.warning("OQUMAIL_API_KEY not set — email to %s skipped (dev mode)", to)
        return {"success": False, "error": "no_api_key", "dev_mode": True}

    if isinstance(to, str):
        to = [to]

    payload = {
        "to": to,
        "subject": subject,
        "html": html,
        "text": _html_to_plain(html),
        "fromName": from_name,
    }

    # List-Unsubscribe header (Gmail/Outlook one-click unsubscribe)
    if unsubscribe_url:
        payload["headers"] = {
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }

    req = urllib.request.Request(
        OQUMAIL_API,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            logger.info("Email sent to %s — ID: %s", to, result.get("id"))
            return {"success": True, "id": result.get("id"), "status": result.get("status")}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            err = json.loads(body)
            error_msg = err.get("reason", body)
        except Exception:
            error_msg = body
        logger.error("OquMail error %s to %s: %s", e.code, to, error_msg)
        return {"success": False, "error": error_msg, "code": e.code}
    except Exception as e:
        logger.error("OquMail failed to %s: %s", to, e)
        return {"success": False, "error": str(e)}


async def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    from_name: str = FROM_NAME,
    unsubscribe_url: str | None = None,
) -> dict:
    """Send an email (async wrapper — runs sync send in thread pool)."""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: send_email_sync(to, subject, html, from_name, unsubscribe_url))


async def send_templated_email(
    to: str,
    template: str,
    variables: dict[str, str],
    subject: str,
    from_name: str = FROM_NAME,
) -> dict:
    """Load a template, fill variables, and send.

    Variables are injected as {{KEY}} replacements. Common variables
    injected automatically if not provided:
        - YEAR (current year for footer)
        - RECIPIENT_NAME (defaults to "Student")
    """
    import datetime

    # Auto-inject common variables
    variables.setdefault("YEAR", str(datetime.datetime.now().year))
    variables.setdefault("RECIPIENT_NAME", "Student")
    from app.core.config import get_settings
    variables.setdefault("FRONTEND_URL", get_settings().frontend_url.rstrip("/"))

    html = _load_template(template)
    if not html:
        return {"success": False, "error": f"template '{template}' not found"}

    html = _fill_template(html, variables)

    # Auto-inject unsubscribe URL if template has the placeholder
    unsub_url = None
    if "{{UNSUBSCRIBE_URL}}" in html and "UNSUBSCRIBE_URL" not in variables:
        user_id = variables.get("USER_ID", "")
        unsub_category = variables.get("UNSUBSCRIBE_CATEGORY", "marketing")
        if user_id:
            from app.api.unsubscribe import make_unsubscribe_url
            unsub_url = make_unsubscribe_url(user_id, unsub_category)
            html = html.replace("{{UNSUBSCRIBE_URL}}", unsub_url)
    elif "UNSUBSCRIBE_URL" in variables:
        unsub_url = variables["UNSUBSCRIBE_URL"]

    return await send_email(to, subject, html, from_name, unsubscribe_url=unsub_url)
