"""The permanent partner-line cache.

Library scenes are public domain and shared by every actor, so the second
actor to run a scene pays nothing and waits for nothing. Only a user upload on
its very first run is cold, and the client hides that by fetching N+1 while N
plays.

A row is keyed by everything the audio was made from: vendor, model, voice,
the character sentence, the acting note, the delivery note, the actor's own
note and the words. So a change to any of them (a new model, a reading that
gained notes, Gemini replacing OpenAI) is a new key, and the line is voiced
again the next time it is played. Nothing here regenerates in bulk.

The monthly spending guard lives here too, because the spend is derived from
these rows: the characters of this calendar month's ready Gemini rows. Past
PARTNER_TTS_MONTHLY_CHARS new lines go to Inworld; a line already saved, in
any voice, is played as it is.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from sqlalchemy import func

from app.core.config import settings
from app.models.rehearsal import PartnerAudio
from app.services.rehearsal.delivery import LineVoice
from app.services.rehearsal.synth import model_for, synthesize
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


def audio_key(vendor: str, voice: str, line: LineVoice) -> str:
    """The cache key: everything the audio was made from.

    OpenAI and ElevenLabs keep the key they always had (vendor, voice, the
    note, the words), with the delivery note as the note, so a deploy
    without a Gemini key keeps the lines it already paid for. They are only
    ever sent the delivery note, so nothing they say is missing from it.
    """
    if vendor in ("openai", "elevenlabs"):
        raw = "|".join([vendor, voice, _norm(line.delivery), _norm(line.text)])
    else:
        raw = "|".join([
            "v3", vendor, model_for(vendor), voice, _norm(line.persona), _norm(line.acting),
            _norm(line.delivery), _norm(line.note), _norm(line.text),
        ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def storage_path(key: str) -> str:
    return f"{key[:2]}/{key}.mp3"


def ensure(db: Session, vendor: str, voice: str, line: LineVoice) -> str:
    """Make sure a row exists for this line. Returns the key. Does not synthesise."""
    key = audio_key(vendor, voice, line)
    if db.get(PartnerAudio, key) is None:
        db.add(PartnerAudio(key=key, vendor=vendor, voice=voice, status="pending", chars=len(line.text)))
        db.flush()
    return key


# ── the monthly cap ──────────────────────────────────────────────────────────

CAP_MAILED_KEY = "partner_tts_cap_mailed"


def _month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def chars_this_month(db: Session, now: datetime | None = None) -> int:
    """Characters Gemini has voiced this calendar month (UTC), from the cache.

    Ready rows only: a failed line was not billed, and a pending one is not
    yet. A row made last month and voiced this month counts last month,
    which is a few lines either side of midnight on the 1st."""
    now = now or datetime.now(timezone.utc)
    total = (
        db.query(func.coalesce(func.sum(PartnerAudio.chars), 0))
        .filter(PartnerAudio.vendor == "gemini", PartnerAudio.status == "ready",
                PartnerAudio.created_at >= _month_start(now))
        .scalar()
    )
    return int(total or 0)


def over_cap(db: Session, now: datetime | None = None) -> bool:
    """Whether this month's Gemini characters have reached the cap. The first
    time it is true in a month, the founder gets one email (across every
    process: app_settings.claim_day keyed by the month)."""
    if settings.partner_tts_vendor != "gemini":
        return False
    now = now or datetime.now(timezone.utc)
    used = chars_this_month(db, now)
    if used < settings.partner_tts_monthly_chars:
        return False
    _mail_cap_once(db, now, used)
    return True


def _mail_cap_once(db: Session, now: datetime, used: int) -> None:
    month = now.strftime("%Y-%m")
    try:
        from app.services.app_settings import claim_day
        if not claim_day(db, CAP_MAILED_KEY, month):
            return
        from app.services.email.notifications import send_partner_tts_cap_notification
        send_partner_tts_cap_notification(
            month=month, used=used, cap=settings.partner_tts_monthly_chars,
            fallback="Inworld" if settings.inworld_api_key else None,
        )
    except Exception as exc:  # noqa: BLE001  (a mail must never stop a line)
        logger.warning("partner tts cap mail failed: %s", exc)


def vendor_for(db: Session, voice: str, line: LineVoice, capped: bool) -> str:
    """Who voices this line. The configured vendor, unless the month's cap is
    reached (`capped`, from over_cap, worked out once per request) and the
    line is not already saved: then Inworld. A line Gemini already voiced,
    or is voicing, stays Gemini's; the cap never throws audio away. With no
    Inworld key there is nobody to fall back to, so Gemini carries on and the
    founder's email says so."""
    primary = settings.partner_tts_vendor
    if primary != "gemini" or not capped or not settings.inworld_api_key:
        return primary
    if db.get(PartnerAudio, audio_key(primary, voice, line)) is not None:
        return primary
    return "inworld"


def ensure_for(db: Session, voice: str, line: LineVoice, capped: bool) -> str:
    """ensure() with the vendor chosen by vendor_for. What the routes call."""
    return ensure(db, vendor_for(db, voice, line, capped), voice, line)


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


def synthesise_pending(db: Session, keys: list[str], line_for: dict[str, LineVoice]) -> None:
    """Synthesise each key in order. `line_for` maps key -> what to say and how.
    Safe to call from several workers at once: a row is claimed before work."""
    for key in keys:
        if not _claim(db, key):
            continue
        row = db.get(PartnerAudio, key)
        line = line_for[key]
        try:
            audio = synthesize(row.vendor, row.voice, line)
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
