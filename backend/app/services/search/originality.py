"""Originality (overdone score) is a Plus filter.

The free tier sees every piece; the cap only applies for a paid account, so a
typed URL cannot do what the sheet refuses. 0.3 is "fresh picks", 0.7 is
"popular too", 1.0 / None is everything.
"""

FRESH = 0.3


def originality_cap(max_overdone_score: float | None, exclude_overdone: bool, *, is_paid: bool) -> float | None:
    if not is_paid:
        return None
    if max_overdone_score is not None:
        return max_overdone_score
    if exclude_overdone:
        return FRESH
    return None
