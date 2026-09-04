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

# What the /admin/users list filter accepts. "unknown" is not a stored value —
# it is the NULL bulk, and it has to be selectable or there is no way to see who
# still needs tagging.
ACCOUNT_TYPE_FILTERS: tuple[str, ...] = ACCOUNT_TYPES + ("unknown",)


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


def account_type_filter(column, value: str):
    """WHERE clause for one ACCOUNT_TYPE_FILTERS token.

    "unknown" must become IS NULL. `column == "unknown"` compiles perfectly well
    and then matches zero rows forever, which reads as "I have no untagged
    users" rather than as a bug.
    """
    if value == "unknown":
        return column.is_(None)
    return column == value
