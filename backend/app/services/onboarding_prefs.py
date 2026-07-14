"""Derivations from profile-first onboarding answers into search levers.

Keep this module dependency-free (pure functions) so it stays trivially
testable and safe to import anywhere.
"""

from typing import Optional

# Career stage -> overdone-alert sensitivity (0 = tolerate warhorses, 1 = only
# fresh). Beginners want the recognizable pieces; pros want to avoid them.
_STAGE_SENSITIVITY = {
    "just_starting": 0.2,
    "auditioning": 0.5,
    "working_pro": 0.8,
}

_DEFAULT_SENSITIVITY = 0.5


def overdone_sensitivity_for_stage(stage: Optional[str]) -> float:
    """Map a career stage id to an ``overdone_alert_sensitivity`` value.

    Unknown or missing stages fall back to the balanced default.
    """
    if not stage:
        return _DEFAULT_SENSITIVITY
    return _STAGE_SENSITIVITY.get(stage, _DEFAULT_SENSITIVITY)
