"""
Bounce capture for the SMTP send path.

Bulk mail goes out through Google Workspace SMTP, which has no provider, no
webhook and no delivery API. `webhooks.py` learns about Resend bounces and
suppresses them; the SMTP path had no equivalent, so a dead address was mailed
again on every single campaign and nothing ever recorded it. The only place
those failures exist is the sending mailbox, as delivery-status notifications
from Gmail's mailer-daemon.

So that mailbox is the source. This reads it over IMAP (the same app password
already used to send), parses the RFC 3464 delivery-status parts, and adds
permanent failures to email_do_not_contact -- which marketing.py already
filters every campaign against, so suppression takes effect with no further
wiring.

PERMANENT ONLY. A 4.x.x is Gmail saying "not now": the ghost-light launch ended
with one of those (421 4.3.0 Temporary System Problem) against a perfectly good
address at a real conservatory. Suppressing on a soft failure would quietly
delete real actors from every future send, which is far worse than mailing a
dead address twice.
"""

from __future__ import annotations

import email
import imaplib
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from email.message import Message
from typing import Any, Iterable, Optional

logger = logging.getLogger(__name__)

IMAP_HOST = "imap.gmail.com"

# Gmail's bounce notifications. Locale-independent: the address is stable where
# the subject line ("Delivery Status Notification (Failure)") is not.
DAEMON_PATTERNS = ("mailer-daemon@", "postmaster@")

# "5.1.1" -> permanent, "4.3.0" -> transient. RFC 3463.
_STATUS_RE = re.compile(r"\b([245])\.\d{1,3}\.\d{1,3}\b")
_ADDR_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def _addr_from_final_recipient(value: str) -> Optional[str]:
    """`rfc822; someone@example.com` -> `someone@example.com`."""
    if not value:
        return None
    raw = value.split(";", 1)[-1].strip().strip("<>").strip()
    m = _ADDR_RE.search(raw)
    return m.group(0).lower() if m else None


def _iter_delivery_status(msg: Message) -> Iterable[Message]:
    """Yield every message/delivery-status part, at any nesting depth."""
    for part in msg.walk():
        if part.get_content_type() == "message/delivery-status":
            yield part


def parse_bounce(msg: Message) -> list[dict[str, Any]]:
    """
    Pull one result per failed recipient out of a delivery-status notification.

    Returns dicts of {email, status, action, permanent, diagnostic}. An empty
    list means this was not a bounce we understand, which is the safe answer --
    a misparse that invents a permanent failure would silently drop a real
    recipient from every future campaign.
    """
    results: list[dict[str, Any]] = []

    for ds in _iter_delivery_status(msg):
        # A delivery-status body is a sequence of header blocks: one per-message
        # block, then one per-recipient. email parses them as sub-"messages".
        for block in ds.get_payload():
            if not isinstance(block, Message):
                continue
            final = block.get("Final-Recipient") or block.get("Original-Recipient")
            addr = _addr_from_final_recipient(final or "")
            if not addr:
                continue

            action = (block.get("Action") or "").strip().lower()
            status = (block.get("Status") or "").strip()
            diagnostic = (block.get("Diagnostic-Code") or "").strip()

            klass = None
            m = _STATUS_RE.search(status)
            if m:
                klass = m.group(1)
            elif diagnostic:
                # Some servers omit Status but put the code in the diagnostic.
                m2 = _STATUS_RE.search(diagnostic)
                klass = m2.group(1) if m2 else None

            # Permanent needs BOTH a failed action and a 5.x.x class. Requiring
            # both is deliberate: "delayed" with a 5.x.x, or "failed" with no
            # parseable class, is not enough to delete someone permanently.
            permanent = action == "failed" and klass == "5"

            results.append(
                {
                    "email": addr,
                    "status": status or None,
                    "action": action or None,
                    "permanent": permanent,
                    "diagnostic": diagnostic[:300] or None,
                }
            )

    return results


def scan_bounces(
    db,
    since_days: int = 30,
    dry_run: bool = True,
    mailbox: str = "INBOX",
) -> dict[str, Any]:
    """
    Read the sending mailbox, parse bounce notices, suppress permanent failures.

    dry_run defaults to True on purpose: this writes to the list that decides
    who never hears from ActorRise again, so seeing the addresses before
    committing to them should be the easy path, not the careful one.
    """
    address = os.getenv("SMTP_EMAIL", "canberk@actorrise.com")
    password = os.getenv("SMTP_APP_PASSWORD")
    if not password:
        return {"error": "SMTP_APP_PASSWORD not set", "scanned": 0}

    since = (datetime.now(timezone.utc) - timedelta(days=since_days)).strftime("%d-%b-%Y")

    permanent: dict[str, dict[str, Any]] = {}
    transient: dict[str, dict[str, Any]] = {}
    scanned = 0
    unparsed = 0

    imap = imaplib.IMAP4_SSL(IMAP_HOST)
    try:
        imap.login(address, password)
        imap.select(mailbox, readonly=True)

        uids: set[bytes] = set()
        for pattern in DAEMON_PATTERNS:
            typ, data = imap.search(None, "FROM", pattern, "SINCE", since)
            if typ == "OK" and data and data[0]:
                uids.update(data[0].split())

        for uid in sorted(uids):
            typ, data = imap.fetch(uid, "(RFC822)")
            if typ != "OK" or not data or not data[0]:
                continue
            raw = data[0][1]
            if not isinstance(raw, (bytes, bytearray)):
                continue
            scanned += 1
            msg = email.message_from_bytes(bytes(raw))
            found = parse_bounce(msg)
            if not found:
                unparsed += 1
                continue
            for r in found:
                bucket = permanent if r["permanent"] else transient
                bucket.setdefault(r["email"], r)
    finally:
        try:
            imap.logout()
        except Exception:
            pass

    # A transient failure on an address that ALSO bounced permanently is still
    # permanent; don't let a later soft retry rescue it.
    for addr in permanent:
        transient.pop(addr, None)

    from app.models.email_do_not_contact import EmailDoNotContact

    already = {
        e.lower()
        for (e,) in db.query(EmailDoNotContact.email).all()
        if e
    }
    to_add = [r for addr, r in permanent.items() if addr not in already]

    if not dry_run and to_add:
        from app.api.webhooks import _suppress

        for r in to_add:
            reason = f"bounced ({r.get('status') or 'permanent'}) via smtp scan"
            _suppress(db, r["email"], reason)
        db.commit()

    return {
        "dry_run": dry_run,
        "since_days": since_days,
        "messages_scanned": scanned,
        "messages_unparsed": unparsed,
        "permanent": sorted(permanent),
        "transient_ignored": sorted(transient),
        "already_suppressed": sorted(a for a in permanent if a in already),
        "added": sorted(r["email"] for r in to_add),
        "added_count": len(to_add) if not dry_run else 0,
        "would_add_count": len(to_add) if dry_run else 0,
    }
