"""One way off the list, whichever way a person asks.

Until 2026-09-30 the unsubscribe link only turned marketing_opt_in off, while a
reply of "unsubscribe" (filed by hand with scripts/opt_out.py) went onto
email_do_not_contact as well. Every sender checks both lists, so nobody was
mailed by mistake, but the do-not-contact table was not the whole story.
Now both paths come through here and land in both places.

Reasons carry a prefix so the resubscribe link knows what it may undo:
    OPT-OUT: ...   the person asked to stop (link or reply); resubscribe removes it
    BOUNCE: ...    the address is dead; stays
Paid users are listed by the Stripe webhook under its own reason and stay too.
"""

from datetime import date

from sqlalchemy import func

OPT_OUT_PREFIX = "OPT-OUT:"


def link_reason(today: date | None = None) -> str:
    return f"{OPT_OUT_PREFIX} clicked the unsubscribe link on {(today or date.today()).isoformat()}"


def opt_out(db, email: str, reason: str, bounce: bool = False) -> dict:
    """Returns {"listed": bool, "account": "opted_out" | "already_out" | "none" | "left_alone"}."""
    from app.models.email_do_not_contact import EmailDoNotContact
    from app.models.user import User

    address = email.strip().lower()
    if "@" not in address:
        raise ValueError(f"not an email address: {email!r}")
    if not reason.strip():
        raise ValueError("a reason is required: say what they replied to, and the date")

    user = db.query(User).filter(func.lower(User.email) == address).first()

    listed = False
    exists = (
        db.query(EmailDoNotContact.id)
        .filter(func.lower(EmailDoNotContact.email) == address)
        .first()
    )
    if exists is None:
        db.add(
            EmailDoNotContact(
                email=address,
                name=getattr(user, "name", None) if user else None,
                reason=reason.strip(),
            )
        )
        listed = True

    if bounce:
        account = "left_alone"
    elif user is None:
        account = "none"
    elif not user.marketing_opt_in:
        account = "already_out"
    else:
        user.marketing_opt_in = False
        account = "opted_out"

    db.commit()
    return {"listed": listed, "account": account}


def opt_back_in(db, email: str) -> dict:
    """The resubscribe link. Turns marketing_opt_in on and removes an OPT-OUT row.

    A BOUNCE row, or the row the Stripe webhook adds for a payer, is not the
    person's choice to reverse, so those stay and the address stays unmailable.
    Returns {"delisted": bool, "account": "opted_in" | "already_in" | "none"}.
    """
    from app.models.email_do_not_contact import EmailDoNotContact
    from app.models.user import User

    address = email.strip().lower()

    row = (
        db.query(EmailDoNotContact)
        .filter(func.lower(EmailDoNotContact.email) == address)
        .first()
    )
    delisted = False
    if row is not None and (row.reason or "").upper().startswith(OPT_OUT_PREFIX):
        db.delete(row)
        delisted = True

    user = db.query(User).filter(func.lower(User.email) == address).first()
    if user is None:
        account = "none"
    elif user.marketing_opt_in:
        account = "already_in"
    else:
        user.marketing_opt_in = True
        account = "opted_in"

    db.commit()
    return {"delisted": delisted, "account": account}
