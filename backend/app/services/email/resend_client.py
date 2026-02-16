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
        from_email: str = "ActorRise <notifications@actorrise.com>"
    ) -> dict:
        """
        Send an email via Resend.

        Args:
            to: Recipient email address
            subject: Email subject
            html: HTML email body
            from_email: Sender email (default: notifications@actorrise.com)

        Returns:
            Resend response dict with email ID

        Raises:
            Exception: If email sending fails
        """
        try:
            response = resend.Emails.send({
                "from": from_email,
                "to": to,
                "subject": subject,
                "html": html
            })

            return response

        except Exception as e:
            print(f"Error sending email to {to}: {e}")
            raise
