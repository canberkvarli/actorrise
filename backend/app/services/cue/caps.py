"""Who may send Cue another message, and whether Cue has spent today's budget.

Free: CUE_FREE_MONTHLY messages per calendar month (UTC). A daily cap resets
every morning and so never asks anyone for anything; a monthly one is a wall,
the same shape as the free reads. Message CUE_FREE_MONTHLY + 1 is refused on
the server and the sheet shows the paywall.

Plus: no number in the UI. CUE_PLUS_DAILY is an abuse guard only.

Everyone: CUE_DAILY_USD is a ceiling on what Cue may cost in one UTC day,
summed from the tokens stored on each reply. Past it Cue rests and the
question goes to Canberk instead.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone

from app.models.cue import CueMessage
from sqlalchemy import func
from sqlalchemy.orm import Session

MODEL = "claude-haiku-5-5"
# Haiku 5.5, $ per million tokens (prompts under 100K). Input is charged at the
# full rate even when it was a cache read, so the ceiling errs high.
USD_PER_M_INPUT = 0.10
USD_PER_M_OUTPUT = 0.50


def free_monthly() -> int:
    return int(os.getenv("CUE_FREE_MONTHLY", "15"))


def plus_daily() -> int:
    return int(os.getenv("CUE_PLUS_DAILY", "300"))


def daily_usd() -> float:
    return float(os.getenv("CUE_DAILY_USD", "1.0"))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def day_start(now: datetime | None = None) -> datetime:
    now = now or _utc_now()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def month_start(now: datetime | None = None) -> datetime:
    return day_start(now).replace(day=1)


def messages_since(db: Session, user_id: int, since: datetime) -> int:
    return (
        db.query(func.count(CueMessage.id))
        .filter(CueMessage.user_id == user_id, CueMessage.role == "user", CueMessage.created_at >= since)
        .scalar()
        or 0
    )


def spend_today(db: Session, now: datetime | None = None) -> float:
    row = (
        db.query(func.coalesce(func.sum(CueMessage.input_tokens), 0), func.coalesce(func.sum(CueMessage.output_tokens), 0))
        .filter(CueMessage.created_at >= day_start(now))
        .one()
    )
    return cost_usd(int(row[0]), int(row[1]))


def cost_usd(input_tokens: int, output_tokens: int) -> float:
    return input_tokens / 1e6 * USD_PER_M_INPUT + output_tokens / 1e6 * USD_PER_M_OUTPUT


@dataclass
class CapState:
    allowed: bool
    # None | "free_cap" | "plus_cap" | "resting"
    reason: str | None
    used: int
    limit: int | None  # None for Plus: the UI shows no number


def check(db: Session, user_id: int, is_plus: bool, now: datetime | None = None) -> CapState:
    if is_plus:
        used = messages_since(db, user_id, day_start(now))
        if used >= plus_daily():
            return CapState(False, "plus_cap", used, None)
        state = CapState(True, None, used, None)
    else:
        used = messages_since(db, user_id, month_start(now))
        if used >= free_monthly():
            return CapState(False, "free_cap", used, free_monthly())
        state = CapState(True, None, used, free_monthly())
    if spend_today(db, now) >= daily_usd():
        return CapState(False, "resting", state.used, state.limit)
    return state
