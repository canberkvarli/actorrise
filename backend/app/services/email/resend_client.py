"""
Resend email client for sending notifications.

Handles:
- Submission approvals
- Submission rejections
- Manual review notifications
"""

import os
from typing import Optional

import resend


class ResendEmailClient:
    """
    Send emails via Resend API.

    Requires RESEND_API_KEY environment variable.
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Resend client.

        Args:
            api_key: Optional Resend API key (defaults to RESEND_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("RESEND_API_KEY")

        if not self.api_key:
            raise ValueError(
                "RESEND_API_KEY not found. Please set it in your environment or pass it to the constructor."
            )

        resend.api_key = self.api_key

    def send_email(
        self,
        to: str,
        subject: str,
        html: str,
        from_email: str = "Canberk <canberk@actorrise.com>",
        scheduled_at: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
        plain_text: Optional[str] = None,
    ) -> dict:
        """
        Send an email via Resend.

        Args:
            to: Recipient email address
            subject: Email subject
            html: HTML email body (ignored if plain_text is provided)
            from_email: Sender email
            scheduled_at: ISO datetime string to schedule send (max 72h ahead)
            unsubscribe_url: Unused, kept for backward compat
            plain_text: If provided, sends as plain text instead of HTML
                        (lands in Gmail Primary tab more reliably)

        Returns:
            Resend response dict with email ID

        Raises:
            Exception: If email sending fails
        """
        try:
            params: dict = {
                "from": from_email,
                "to": to,
                "subject": subject,
                "reply_to": "canberk@actorrise.com",
            }
            if plain_text:
                params["text"] = plain_text
            else:
                params["html"] = html
            if scheduled_at:
                params["scheduled_at"] = scheduled_at

            response = resend.Emails.send(params)

            return response

        except Exception as e:
            print(f"Error sending email to {to}: {e}")
            raise
