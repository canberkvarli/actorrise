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

And the daily one. Gemini's tier allows GEMINI_TTS_RPD requests a day (100 on
Tier 1, reset at midnight Pacific); on 2026-10-23 that ran out by mid
afternoon and every partner after it was silent. Now a scene is voiced by
Gemini only while the day has room for all of its new lines, and by OpenAI
otherwise, the whole scene, so a part never changes voice in the middle of a
run. A line Gemini refuses for the day anyway is voiced by OpenAI at once.
"""
from __future__ import annotations

import hashlib
import logging
import os
import queue
import re
import threading
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

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
        .filter(PartnerAudio.vendor.in_(("gemini", "vertex")), PartnerAudio.status == "ready",
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
    """Who voices this one line: scene_vendor for a part of one. A line Gemini
    already voiced stays Gemini's; the cap never throws audio away. With no
    Inworld key there is nobody to fall back to past the monthly cap, so Gemini
    carries on and the founder's email says so."""
    return scene_vendor(db, [(voice, line)], capped)


# ── the daily limit ──────────────────────────────────────────────────────────

GEMINI_RPD = int(os.getenv("GEMINI_TTS_RPD", "100"))
PACIFIC = ZoneInfo("America/Los_Angeles")
DAILY_LIMIT = "per day"  # in the text of Gemini's 429 for the daily quota
STAND_IN = "stand-in "   # a failed row's error, followed by the key that read it


def _gemini_day(now: datetime) -> datetime:
    """When Gemini's day began: midnight Pacific, in UTC."""
    local = _aware(now).astimezone(PACIFIC)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def gemini_out_today(db: Session, now: datetime | None = None) -> bool:
    """Whether Gemini has refused a line for the day since its day began. Read
    from the rows, so every process knows once one of them has been told."""
    start = _gemini_day(now or datetime.now(timezone.utc))
    return db.query(PartnerAudio.key).filter(
        PartnerAudio.vendor == "gemini", PartnerAudio.status == "failed",
        PartnerAudio.claimed_at >= start, PartnerAudio.error.ilike(f"%{DAILY_LIMIT}%"),
    ).first() is not None


def gemini_left_today(db: Session, now: datetime | None = None) -> int:
    """Requests left in Gemini's day, counting a row made or tried today as one."""
    start = _gemini_day(now or datetime.now(timezone.utc))
    used = db.query(func.count(PartnerAudio.key)).filter(
        PartnerAudio.vendor == "gemini",
        (PartnerAudio.created_at >= start) | (PartnerAudio.claimed_at >= start),
    ).scalar()
    return GEMINI_RPD - int(used or 0)


def openai_voice(voice: str) -> str:
    """The OpenAI voice standing in for a Gemini one (voices.Voice.day_stand_in).
    Anything else is already an OpenAI id and comes back as it is."""
    from app.services.rehearsal.voices import _GEMINI

    match = next((v for v in _GEMINI if v.id == voice), None)
    return match.day_stand_in if match and match.day_stand_in else voice


def overflow_vendor() -> str | None:
    """Who voices a part when the day's Gemini requests are spent: the same
    voices through Vertex when it is set up, else OpenAI, else nobody."""
    if settings.vertex_project and settings.vertex_service_account_json:
        return "vertex"
    if settings.openai_api_key:
        return "openai"
    return None


def vendor_voice(vendor: str, voice: str) -> str:
    """The Gemini voice a part was cast with, as this vendor names it."""
    return openai_voice(voice) if vendor == "openai" else voice


def scene_vendor(db: Session, pairs: list[tuple[str, LineVoice]], capped: bool,
                 now: datetime | None = None) -> str:
    """Who voices these lines, all of them: one scene's partner part, or one
    line. Gemini when every line is saved in Gemini, or when the day has room
    for the ones that are not. Otherwise the overflow vendor for the lot,
    Gemini's saved lines included, so the part sounds like one person: the
    same voices through Vertex when it is set up, else OpenAI. Past the
    monthly cap, Inworld as before."""
    primary = settings.partner_tts_vendor
    if primary != "gemini" or not pairs:
        return primary
    keys = [audio_key(primary, voice, line) for voice, line in pairs]
    rows = {r.key: r for r in db.query(PartnerAudio).filter(PartnerAudio.key.in_(keys))}
    out = gemini_out_today(db, now)
    unheld = [k for k in keys if k not in rows or not (
        rows[k].status == "ready" or (rows[k].status == "pending" and not out))]
    if not unheld:
        return primary
    if capped and settings.inworld_api_key:
        return "inworld"
    overflow = overflow_vendor()
    if overflow is None:
        return primary
    # A pending row made today is counted in the day already; a missing or a
    # failed one is a request still to come.
    new = sum(1 for k in unheld if k not in rows or rows[k].status == "failed")
    if out or new > gemini_left_today(db, now):
        return overflow
    return primary


def ensure_as(db: Session, vendor: str, voice: str, line: LineVoice) -> str:
    """ensure() for a vendor scene_vendor chose, in that vendor's voice."""
    return ensure(db, vendor, vendor_voice(vendor, voice), line)


def ensure_for(db: Session, voice: str, line: LineVoice, capped: bool) -> str:
    """One line, on its own. The scene routes choose once for the whole part."""
    return ensure_as(db, scene_vendor(db, [(voice, line)], capped), voice, line)


def stand_in_key(row: PartnerAudio) -> str | None:
    """The key of the line that read a Gemini row refused for the day."""
    if row.status != "failed" or not (row.error or "").startswith(STAND_IN):
        return None
    return row.error[len(STAND_IN):].split(":", 1)[0].strip() or None


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
            # One line in the log per clip, naming who voiced it: the only
            # way to see from outside which vendor a day is landing on.
            logger.info("partner audio %s voiced by %s as %s", key[:8], row.vendor, row.voice)
            path = storage_path(key)
            _upload(path, audio)
            row.storage_path = path
            row.status = "ready"
            row.error = None
        except Exception as exc:  # noqa: BLE001
            logger.warning("partner audio %s failed: %s", key[:8], exc)
            row.status = "failed"
            row.error = str(exc)[:500]
            stand_in = None
            overflow = overflow_vendor()
            if row.vendor == "gemini" and DAILY_LIMIT in str(exc) and overflow:
                # Gemini is done for the day and an actor is waiting on this
                # line: the overflow vendor reads it now, the same voice
                # through Vertex when it is set up, and GET /audio/{key}
                # hands that over.
                stand_in = ensure(db, overflow, vendor_voice(overflow, row.voice), line)
                row.error = f"{STAND_IN}{stand_in}: {exc}"[:500]
            # The claim stays: it is now the time of the failure, and the
            # retry clock (FAILED_RETRY) runs from it.
            db.commit()
            if stand_in:
                synthesise_pending(db, [stand_in], {stand_in: line})
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


# ── the worker ───────────────────────────────────────────────────────────────
#
# Lines are voiced by one thread, in the order asked for. With Gemini's
# per-minute limit a fresh scene takes a couple of minutes to voice, and a
# BackgroundTask per request would park a request-pool thread for each waiting
# line, which is the pool every other route runs on.

_jobs: "queue.Queue[tuple[list[str], dict[str, LineVoice]]]" = queue.Queue()
_worker: threading.Thread | None = None
_worker_lock = threading.Lock()


def enqueue(keys: list[str], line_for: dict[str, LineVoice]) -> None:
    """Voice these lines, soon, off the request. Safe to call twice for the
    same key: a row is claimed before work and a ready row is skipped."""
    global _worker
    _jobs.put((list(keys), dict(line_for)))
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_run, name="partner-audio", daemon=True)
            _worker.start()


def _run() -> None:
    from app.core.database import SessionLocal

    while True:
        keys, line_for = _jobs.get()
        db = SessionLocal()
        try:
            synthesise_pending(db, keys, line_for)
        except Exception:  # noqa: BLE001  (one bad job must not stop the worker)
            logger.exception("partner audio worker job failed")
        finally:
            db.close()
