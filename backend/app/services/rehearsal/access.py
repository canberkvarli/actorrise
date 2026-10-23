"""Who may rehearse which scene. Copied out of scenes.start_rehearsal so both
the old router (until it is deleted) and the v2 router share one rule."""
from __future__ import annotations

from fastapi import HTTPException, status

from app.models.billing import UserSubscription
from app.services.benefits import get_effective_benefits

# Curated free-tier library scenes (matched by title — stable across
# environments, unlike ids). Free actors can rehearse these in full; the rest
# of the library is a Plus perk. Spread across tone + difficulty so the free
# taste feels generous, not stingy.
FREE_LIBRARY_SCENE_TITLES = {
    "Romeo and Juliet — The Balcony",
    "The Importance of Being Earnest — Gwendolen and Cecily at Tea",
    "A Midsummer Night's Dream — Helena Pursues Demetrius",
    "Trifles — Mrs. Hale and Mrs. Peters",
}


def is_free_library_scene(scene) -> bool:
    return bool(scene.is_library) and scene.title in FREE_LIBRARY_SCENE_TITLES


def _subscription(db, user_id: int):
    return db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()


def assert_can_rehearse(db, user, scene, script=None) -> None:
    benefits = get_effective_benefits(db, user.id, _subscription(db, user.id))
    if not benefits.get("scene_partner_trial_only", False):
        return
    library_allowed = is_free_library_scene(scene)
    sample_allowed = script is not None and (script.is_sample or script.title.startswith("Example:"))
    own_script_allowed = script is not None and script.user_id == user.id
    if library_allowed or sample_allowed or own_script_allowed:
        return
    if scene.is_library:
        detail = {
            "error": "library_upgrade_required",
            "message": "This scene is part of the full library. Your free plan includes a starter set of scenes to rehearse. Upgrade to Plus for the whole catalog.",
            "upgrade_url": "/pricing",
        }
    else:
        detail = {
            "error": "trial_example_only",
            "message": "Free rehearsal is limited to the example script. Upgrade to Plus to rehearse your own scripts.",
            "upgrade_url": "/pricing",
        }
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# The actor's own note on a partner part ("make him meaner") is Plus.
# A tier says so by an explicit `partner_direction` feature when it has one
# (a UserBenefitOverride can grant or revoke it like any other); otherwise by
# the thing every tier from Plus up shares, unlimited ScenePartner runs. That
# keeps the rule out of a hard-coded list of tier names and needs no change to
# the live pricing table.
PARTNER_DIRECTION_FEATURE = "partner_direction"


def can_direct_partner(db, user) -> bool:
    from app.core.config import settings

    emails = [e.strip().lower() for e in (settings.superuser_emails or "").split(",") if e.strip()]
    if user.email and user.email.lower() in emails:
        return True
    benefits = get_effective_benefits(db, user.id, _subscription(db, user.id))
    if PARTNER_DIRECTION_FEATURE in benefits:
        return bool(benefits[PARTNER_DIRECTION_FEATURE])
    return benefits.get("scene_partner_sessions") == -1
