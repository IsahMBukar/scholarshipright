"""
Cron script to send deadline reminder emails.

Run daily: python scripts/send_reminders.py

Checks saved scholarships with reminder_enabled=True.
Sends emails at 30, 14, 7, and 1 days before deadline via Resend API.
"""
import asyncio
import sys
import os
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, and_
from app.db.session import AsyncSessionLocal
from app.models.saved_scholarship import SavedScholarship
from app.models.scholarship import Scholarship
from app.models.user import User
from app.core.config import get_settings

REMINDER_DAYS = [30, 14, 7, 1]


async def send_reminders():
    settings = get_settings()

    if not settings.resend_api_key:
        print("⚠️  RESEND_API_KEY not configured. Skipping email reminders.")
        return

    import resend
    resend.api_key = settings.resend_api_key

    today = date.today()

    async with AsyncSessionLocal() as session:
        # Get all saved scholarships with reminders enabled
        query = (
            select(SavedScholarship, Scholarship, User)
            .join(Scholarship, SavedScholarship.scholarship_id == Scholarship.id)
            .join(User, SavedScholarship.user_id == User.id)
            .where(
                and_(
                    SavedScholarship.reminder_enabled == True,
                    Scholarship.is_active == True,
                    Scholarship.deadline >= today,
                )
            )
        )
        result = await session.execute(query)
        rows = result.all()

        sent = 0
        for saved, scholarship, user in rows:
            days_until = (scholarship.deadline - today).days

            if days_until in REMINDER_DAYS:
                # Send reminder email
                subject = f"⏰ {scholarship.name} — Deadline in {days_until} day{'s' if days_until != 1 else ''}!"

                html = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #7c5800;">Scholarship Deadline Reminder</h2>
                    <p>Hi {user.full_name or 'there'},</p>
                    <p>This is a reminder that the <strong>{scholarship.name}</strong> scholarship deadline is in <strong>{days_until} day{'s' if days_until != 1 else ''}</strong>.</p>

                    <div style="background: #fff8f3; border: 1px solid #ece1d4; border-radius: 12px; padding: 20px; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #201b13;">{scholarship.name}</h3>
                        <p><strong>Country:</strong> {scholarship.host_country}</p>
                        <p><strong>Funding:</strong> {scholarship.funding_type.replace('_', ' ').title()}</p>
                        <p><strong>Deadline:</strong> {scholarship.deadline.strftime('%B %d, %Y')}</p>
                        {f'<p><strong>Provider:</strong> {scholarship.provider}</p>' if scholarship.provider else ''}
                    </div>

                    <a href="{scholarship.official_url}" style="display: inline-block; background: #f5b942; color: #271900; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Apply Now →</a>

                    <p style="color: #827563; margin-top: 20px; font-size: 12px;">
                        You're receiving this because you saved this scholarship on ScholarshipRight with reminders enabled.
                    </p>
                </div>
                """

                try:
                    resend.Emails.send({
                        "from": settings.from_email,
                        "to": user.email,
                        "subject": subject,
                        "html": html,
                    })
                    sent += 1
                    print(f"  ✅ Sent {days_until}-day reminder to {user.email} for {scholarship.name}")
                except Exception as e:
                    print(f"  ❌ Failed to send to {user.email}: {e}")

        print(f"\n📬 Done. Sent {sent} reminder(s) out of {len(rows)} checked.")


if __name__ == "__main__":
    asyncio.run(send_reminders())
