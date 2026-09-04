"""The account_type vocabulary: who is this account, actor / educator / student.

Every account used to be assumed a working actor. The educator outreach funnel
broke that assumption: teachers get free Plus for themselves and their students,
and there was no way to count them, or to tell their students apart from
everybody else.

Deliberately small. account_type is nullable and nothing backfills it, so null is
a legitimate, permanent value meaning "unknown / legacy" — the large majority of
accounts. Readers must tolerate null rather than defaulting it to "actor", or the
count of real actors becomes a count of everyone who never answered.
"""

ACCOUNT_TYPES: tuple[str, ...] = ("actor", "educator", "student")


def normalize_account_type(value: str | None) -> str | None:
    """Trim, lowercase and validate an account_type.

    None and blank both mean "unknown" and return None — the same trim-and-clear
    rule the referral columns use. Anything outside ACCOUNT_TYPES raises
    ValueError; callers decide the HTTP shape (400 in the API, a pydantic
    ValidationError in the admin request models).
    """
    if value is None:
        return None
    cleaned = value.strip().lower()
    if not cleaned:
        return None
    if cleaned not in ACCOUNT_TYPES:
        raise ValueError(
            f"account_type must be one of {', '.join(ACCOUNT_TYPES)} (got {value!r})"
        )
    return cleaned
