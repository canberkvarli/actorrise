"""The permanent partner-line cache.

Library scenes are public domain and shared by every actor, so the second
actor to run a scene pays nothing and waits for nothing. Only a user upload on
its very first run is cold, and the client hides that by fetching N+1 while N
plays.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.rehearsal import PartnerAudio
from app.services.rehearsal.synth import synthesize
from app.services.storage import get_supabase_client

logger = logging.getLogger(__name__)

SIGNED_URL_SECONDS = 6 * 3600
# A claim older than this is a worker that died mid-line; the row is retaken.
STALE_CLAIM = timedelta(minutes=5)
# A failed line is tried once more this long after it failed. The vendor was
# most likely the problem (a 5xx, a rate limit): five minutes is long enough
# that a scene opened ten times in a row does not hammer it ten times, and
# short enough that an actor who comes back after a cup of tea hears the line.
FAILED_RETRY = timedelta(minutes=5)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def retryable(row: PartnerAudio, now: datetime) -> bool:
    """A failed row whose failure is at least FAILED_RETRY old. `claimed_at` is
    left set when a line fails, so it is the time of the failure. A failed row
    with no claim time predates this rule and is old by definition."""
    if row.status != "failed":
        return False
    if row.claimed_at is None:
        return True
    return now - _aware(row.claimed_at) >= FAILED_RETRY


def audio_key(vendor: str, voice: str, direction: str | None, text: str) -> str:
    raw = "|".join([vendor, voice, _norm(direction or ""), _norm(text)])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def storage_path(key: str) -> str:
    return f"{key[:2]}/{key}.mp3"


def ensure(db: Session, vendor: str, voice: str, direction: str | None, text: str) -> str:
    """Make sure a row exists for this line. Returns the key. Does not synthesise."""
    key = audio_key(vendor, voice, direction, text)
    if db.get(PartnerAudio, key) is None:
        db.add(PartnerAudio(key=key, vendor=vendor, voice=voice, status="pending"))
        db.flush()
    return key


def _claim(db: Session, key: str) -> bool:
    now = datetime.now(timezone.utc)
    row = db.get(PartnerAudio, key)
    if row is None or row.status == "ready":
        return False
    # A fresh failure stays failed until FAILED_RETRY has passed; before that
    # the admin regenerate endpoint (which deletes the row) is the only retry.
    if row.status == "failed" and not retryable(row, now):
        return False
    if row.claimed_at is not None and now - _aware(row.claimed_at) < STALE_CLAIM:
        return False
    row.claimed_at = now
    row.status = "pending"
    row.error = None
    db.commit()
    return True


def _upload(path: str, audio: bytes) -> None:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase storage is not configured")
    client.storage.from_(settings.partner_audio_bucket).upload(
        path, audio, file_options={"content-type": "audio/mpeg", "upsert": "true"},
    )


def synthesise_pending(db: Session, keys: list[str], text_for: dict[str, tuple[str, str | None]]) -> None:
    """Synthesise each key in order. `text_for` maps key -> (text, direction).
    Safe to call from several workers at once: a row is claimed before work."""
    for key in keys:
        if not _claim(db, key):
            continue
        row = db.get(PartnerAudio, key)
        text, direction = text_for[key]
        try:
            audio = synthesize(row.vendor, row.voice, text, direction)
            path = storage_path(key)
            _upload(path, audio)
            row.storage_path = path
            row.status = "ready"
            row.error = None
        except Exception as exc:  # noqa: BLE001
            logger.warning("partner audio %s failed: %s", key[:8], exc)
            row.status = "failed"
            row.error = str(exc)[:500]
            # The claim stays: it is now the time of the failure, and the
            # retry clock (FAILED_RETRY) runs from it.
            db.commit()
            continue
        row.claimed_at = None
        db.commit()


def signed_url(path: str) -> str | None:
    """One line (the per-line audio routes). A scene open uses signed_urls."""
    client = get_supabase_client()
    if client is None:
        return None
    res = client.storage.from_(settings.partner_audio_bucket).create_signed_url(path, SIGNED_URL_SECONDS)
    if isinstance(res, dict):
        return res.get("signedURL") or res.get("signedUrl")
    return None


def signed_urls(paths: list[str]) -> dict[str, str | None]:
    """Every path in one storage round trip (storage3's batch sign). A path
    storage would not sign, or one missing from the reply, maps to None."""
    out: dict[str, str | None] = {p: None for p in paths}
    if not paths:
        return out
    client = get_supabase_client()
    if client is None:
        return out
    res = client.storage.from_(settings.partner_audio_bucket).create_signed_urls(paths, SIGNED_URL_SECONDS)
    for item in res or []:
        if not isinstance(item, dict) or item.get("error"):
            continue
        path = item.get("path")
        if path in out:
            out[path] = item.get("signedURL") or item.get("signedUrl") or None
    return out


def delete_row(db: Session, key: str) -> None:
    row = db.get(PartnerAudio, key)
    if row is None:
        return
    if row.storage_path:
        client = get_supabase_client()
        if client is not None:
            try:
                client.storage.from_(settings.partner_audio_bucket).remove([row.storage_path])
            except Exception as exc:  # noqa: BLE001
                logger.warning("could not remove %s: %s", row.storage_path, exc)
    db.delete(row)
    db.commit()
