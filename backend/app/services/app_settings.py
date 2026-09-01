"""Read/write helpers for the global app_settings key/value table.

Keep keys here as constants so callers don't pass raw strings around.
"""

from sqlalchemy.orm import Session

from app.models.app_setting import AppSetting


# Cosine-similarity floor below which a search returns no results (see
# semantic_search.WEAK_MATCH_FLOOR). Tunable from the admin console so the
# noise/coverage tradeoff can be adjusted without a deploy.
SEARCH_RELEVANCE_FLOOR = "search_relevance_floor"

# When true, the hourly day-1 "you saved a piece" re-engagement scheduler sends.
# Flip off from the admin console to pause it at runtime (takes effect within the
# hour) without a Render env change or redeploy. The env var
# SAVED_PIECE_REMINDER_ENABLED=false remains a hard kill that stops the scheduler
# from starting at all.
SAVED_PIECE_REMINDER_ENABLED = "saved_piece_reminder_enabled"


def get_bool(db: Session, key: str, default: bool = False) -> bool:
    """Return a stored boolean setting, or `default` if the row doesn't exist."""
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None or row.value is None:
        return default
    return row.value.strip().lower() in ("true", "1", "yes", "on")


def set_bool(db: Session, key: str, value: bool) -> bool:
    """Upsert a boolean setting and return the stored value. Commits."""
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    serialized = "true" if value else "false"
    if row is None:
        row = AppSetting(key=key, value=serialized)
        db.add(row)
    else:
        row.value = serialized
    db.commit()
    return value


def get_float(db: Session, key: str, default: float = 0.0) -> float:
    """Return a stored float setting, or `default` if missing or unparseable.

    Never raises: a typo in the admin console must not take search down.
    """
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None or row.value is None:
        return default
    try:
        return float(row.value.strip())
    except (TypeError, ValueError):
        return default


def set_float(db: Session, key: str, value: float) -> float:
    """Upsert a float setting and return the stored value. Commits."""
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None:
        db.add(AppSetting(key=key, value=str(value)))
    else:
        row.value = str(value)
    db.commit()
    return value


def set_value(db: Session, key: str, value: str) -> str:
    """Upsert a raw string setting and return it. Commits.

    The typed setters (set_bool/set_float) are the normal path; this exists for
    callers that already hold a serialized string (and for tests that need to
    plant an unparseable value to exercise the get_* fallbacks).
    """
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value
    db.commit()
    return value
