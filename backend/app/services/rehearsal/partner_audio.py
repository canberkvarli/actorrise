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


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


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
    if row.claimed_at is not None:
        claimed = row.claimed_at if row.claimed_at.tzinfo else row.claimed_at.replace(tzinfo=timezone.utc)
        if now - claimed < STALE_CLAIM:
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
        row.claimed_at = None
        db.commit()


def signed_url(path: str) -> str | None:
    client = get_supabase_client()
    if client is None:
        return None
    res = client.storage.from_(settings.partner_audio_bucket).create_signed_url(path, SIGNED_URL_SECONDS)
    if isinstance(res, dict):
        return res.get("signedURL") or res.get("signedUrl")
    return None


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
