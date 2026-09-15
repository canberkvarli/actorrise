"""
SMTP email client for sending via Google Workspace.

Sends through smtp.gmail.com for better Gmail Primary tab placement.
Marketing emails should use this instead of Resend.
"""

import contextlib
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)

# Recycle the connection every N messages rather than waiting for Gmail to
# close it. Gmail will drop a long-lived session on its own schedule, and a
# drop we cause deliberately between messages is free, where one it causes
# mid-send costs a recipient.
MESSAGES_PER_CONNECTION = 100


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
        # Set only inside batch_session(). None means one-shot mode.
        self._server: Optional[smtplib.SMTP] = None
        self._sent_on_connection = 0
        self._in_batch = False

        if not self.app_password:
            raise ValueError(
                "SMTP_APP_PASSWORD not found. Generate an App Password in Google Workspace: "
                "Google Account > Security > 2-Step Verification > App passwords"
            )

    # ------------------------------------------------------------------
    # Connection handling
    #
    # This used to open a brand-new TCP connection, STARTTLS handshake and
    # LOGIN for every single message. On the ghost-light launch (batch 22,
    # 791 recipients) that was 791 logins at one every two seconds, and Gmail
    # stopped answering partway through: 372 of them died with an identical
    # "Connection unexpectedly closed". Gmail throttles repeated authentication
    # far harder than it throttles messages, so the login rate — not the send
    # volume — was what tripped it. The daily cap was never in play; the whole
    # batch was under 800 on a 2,000/day limit.
    #
    # Inside batch_session() the connection is opened once and held. Outside
    # it, one-shot behaviour is unchanged, so single sends and the transactional
    # paths keep working exactly as before.
    # ------------------------------------------------------------------

    def _connect(self) -> smtplib.SMTP:
        server = smtplib.SMTP("smtp.gmail.com", 587, timeout=30)
        server.starttls()
        server.login(self.email, self.app_password)
        self._sent_on_connection = 0
        return server

    def _close(self) -> None:
        if self._server is not None:
            with contextlib.suppress(Exception):
                self._server.quit()
        self._server = None
        self._sent_on_connection = 0

    @contextlib.contextmanager
    def batch_session(self):
        """
        Hold one authenticated connection open for a whole batch.

        Entering does NOT connect: a batch whose rows are all skipped should
        not authenticate at all. The first send opens it lazily.
        """
        self._close()
        self._in_batch = True
        try:
            yield self
        finally:
            self._in_batch = False
            self._close()

    def _deliver(self, to: str, raw: str) -> None:
        """Hand one message over, reconnecting if the session is not usable."""
        if not self._in_batch:
            # One-shot: connect, send, drop. Unchanged from before.
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
                server.starttls()
                server.login(self.email, self.app_password)
                server.sendmail(self.email, to, raw)
            return

        if self._server is None:
            self._server = self._connect()
        elif self._sent_on_connection >= MESSAGES_PER_CONNECTION:
            self._close()
            self._server = self._connect()

        try:
            self._server.sendmail(self.email, to, raw)
        except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, OSError) as e:
            # The session died between messages. One reconnect and one retry —
            # a recipient should not be lost to a dropped socket, but a genuine
            # block should surface rather than be retried forever.
            logger.warning("SMTP session lost (%s); reconnecting for %s", e, to)
            self._close()
            self._server = self._connect()
            self._server.sendmail(self.email, to, raw)

        self._sent_on_connection += 1

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
            self._deliver(to, msg.as_string())
            return {"id": None, "status": "sent_via_smtp"}

        except Exception as e:
            logger.warning("SMTP error sending to %s: %s", to, e)
            raise
