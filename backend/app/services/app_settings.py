"""Read/write helpers for the global app_settings key/value table.

Keep keys here as constants so callers don't pass raw strings around.
"""

from sqlalchemy.orm import Session

from app.models.app_setting import AppSetting

# When true, new signups receive the founding-actor offer email (FOUNDER3).
# Flip off from the admin console once founding spots close.
FOUNDER_OFFER_ON_SIGNUP = "founder_offer_on_signup"


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
