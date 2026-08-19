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
        unsubscribe_url: Optional[str] = None,
        **kwargs,
    ) -> dict:
        """
        Send an email via Google Workspace SMTP.

        Args:
            to: Recipient email address
            subject: Email subject
            html: HTML email body
            from_email: Sender display (default: Canberk <email>)
            plain_text: Plain-text part. Sent ALONGSIDE html as multipart, not
                        instead of it.
            unsubscribe_url: Adds List-Unsubscribe headers so Gmail shows its
                             native one-click Unsubscribe next to the sender

        Returns:
            dict with status
        """
        sender = from_email or f"Canberk <{self.email}>"

        # Always multipart/alternative with BOTH parts when we have both.
        # Attach order matters: least-preferred first, so html goes last.
        # Sending the plain part alone silently drops the open-tracking pixel
        # (it only exists in the HTML), which is why bulk batches used to
        # report zero opens.
        if plain_text and html:
            msg = MIMEMultipart("alternative")
            msg.attach(MIMEText(plain_text, "plain"))
            msg.attach(MIMEText(html, "html"))
        elif html:
            msg = MIMEText(html, "html")
        else:
            msg = MIMEText(plain_text or "", "plain")

        msg["From"] = sender
        msg["To"] = to
        msg["Subject"] = subject
        msg["Reply-To"] = self.email
        if unsubscribe_url:
            msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
            msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

        try:
            with smtplib.SMTP("smtp.gmail.com", 587) as server:
                server.starttls()
                server.login(self.email, self.app_password)
                server.sendmail(self.email, to, msg.as_string())

            return {"id": None, "status": "sent_via_smtp"}

        except Exception as e:
            print(f"SMTP error sending to {to}: {e}")
            raise
