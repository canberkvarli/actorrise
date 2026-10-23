"""How many scenes one account may have the model read in a calendar month.

Every scene of an upload is read by a model now (services/scene_reader), at
about a cent and a half a scene. The plans bound that almost everywhere: free
builds one scene of one script, Plus five scripts. Pro is unlimited scripts
with every scene, so one account uploading forty plays could cost more than
the plan brings in, and so could a script that goes wrong and is rebuilt over
and over. This is the net under that, not a plan limit: no real actor builds
three hundred scenes in a month.

Past the budget nothing breaks. The scenes are still cut and built by the
rule parser, flagged "check lines" like any scene the model could not ground,
and the founder hears about it once, so a real person hitting it gets a
human answer rather than a quietly worse product.

The count is scenes built this month on the account's own scripts. Built is
a close enough stand-in for read: every built scene was read, or tried.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

SCENE_READS_PER_MONTH = int(os.getenv("SCENE_READS_PER_MONTH", "300"))

# What a scene past the budget says about itself, in the reading record.
LIMIT_PROBLEM = "the account's monthly scene reading is used up"

ADMIN_EMAIL = "canberk@actorrise.com"

# (user_id, "YYYY-MM") already told about, so a big upload past the line is
# one email, not one per batch. Per process, which is fine: at worst Render
# restarts and the founder hears twice.
_told: set = set()
_told_lock = threading.Lock()


def month_start(now: Optional[datetime] = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def scenes_built_this_month(db: Session, user_id: int) -> int:
    from app.models.actor import Scene, UserScript

    return (
        db.query(func.count(Scene.id))
        .join(UserScript, Scene.user_script_id == UserScript.id)
        .filter(UserScript.user_id == user_id, Scene.created_at >= month_start())
        .scalar()
        or 0
    )


def reading_budget(db: Session, user_id: Optional[int]) -> Optional[int]:
    """Scenes this account may still have read this month. None is no limit
    (no account to count against, e.g. a script with no owner)."""
    if not user_id:
        return None
    try:
        used = scenes_built_this_month(db, user_id)
    except Exception:
        # Counting must never be the thing that breaks an upload.
        logger.exception("reading_budget: could not count scenes for user %s", user_id)
        return None
    return max(0, SCENE_READS_PER_MONTH - used)


def tell_founder_once(user_id: int, over_by: int) -> None:
    """One email per account per month when its reading runs out."""
    key = (user_id, month_start().strftime("%Y-%m"))
    with _told_lock:
        if key in _told:
            return
        _told.add(key)
    try:
        from app.services.email.resend_client import ResendEmailClient

        ResendEmailClient().send_email(
            to=ADMIN_EMAIL,
            subject=f"Scene reading cap hit: user {user_id}",
            html=(
                f"<p>User {user_id} has had {SCENE_READS_PER_MONTH} scenes read this month. "
                f"{over_by} more were built by the rule parser and flagged \"check lines\".</p>"
                f"<p>The cap is SCENE_READS_PER_MONTH on Render. Look them up in /admin/users/{user_id}.</p>"
            ),
        )
    except Exception:
        logger.exception("reading_budget: founder email failed for user %s", user_id)
