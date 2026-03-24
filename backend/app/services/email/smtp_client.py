"""
SMTP email client for sending via Google Workspace.

Sends through smtp.gmail.com for better Gmail Primary tab placement.
Marketing emails should use this instead of Resend.
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


class SmtpEmailClient:
    """
    Send emails via Google Workspace SMTP.

    Requires SMTP_EMAIL and SMTP_APP_PASSWORD environment variables.
    """

    def __init__(
        self,
        email: Optional[str] = None,
        app_password: Optional[str] = None,
    ):
        self.email = email or os.getenv("SMTP_EMAIL", "canberk@actorrise.com")
        self.app_password = app_password or os.getenv("SMTP_APP_PASSWORD")

        if not self.app_password:
            raise ValueError(
                "SMTP_APP_PASSWORD not found. Generate an App Password in Google Workspace: "
                "Google Account > Security > 2-Step Verification > App passwords"
            )

    def send_email(
        self,
        to: str,
        subject: str,
        html: str = "",
        from_email: Optional[str] = None,
        plain_text: Optional[str] = None,
        **kwargs,
    ) -> dict:
        """
        Send an email via Google Workspace SMTP.

        Args:
            to: Recipient email address
            subject: Email subject
            html: HTML email body (used if plain_text is not provided)
            from_email: Sender display (default: Canberk <email>)
            plain_text: If provided, sends as plain text only

        Returns:
            dict with status
        """
        sender = from_email or f"Canberk <{self.email}>"

        if plain_text:
            msg = MIMEText(plain_text, "plain")
        else:
            msg = MIMEMultipart("alternative")
            msg.attach(MIMEText(html, "html"))

        msg["From"] = sender
        msg["To"] = to
        msg["Subject"] = subject
        msg["Reply-To"] = self.email

        try:
            with smtplib.SMTP("smtp.gmail.com", 587) as server:
                server.starttls()
                server.login(self.email, self.app_password)
                server.sendmail(self.email, to, msg.as_string())

            return {"id": None, "status": "sent_via_smtp"}

        except Exception as e:
            print(f"SMTP error sending to {to}: {e}")
            raise
