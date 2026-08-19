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
            unsubscribe_url: Adds List-Unsubscribe headers so Gmail shows its
                             native one-click Unsubscribe next to the sender
            plain_text: Plain-text part. Sent ALONGSIDE html as multipart, not
                        instead of it.

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
            # Send BOTH parts, never one or the other. A text/html multipart is
            # what every mail client expects: the plain part is the Primary-tab
            # signal and the fallback, the HTML part carries the styling and the
            # open-tracking pixel. Sending text alone silently drops the pixel,
            # which is why bulk batches used to report zero opens.
            if plain_text:
                params["text"] = plain_text
            if html:
                params["html"] = html
            if scheduled_at:
                params["scheduled_at"] = scheduled_at
            if unsubscribe_url:
                params["headers"] = {
                    "List-Unsubscribe": f"<{unsubscribe_url}>",
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                }

            response = resend.Emails.send(params)

            return response

        except Exception as e:
            print(f"Error sending email to {to}: {e}")
            raise
