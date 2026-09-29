"""Take one person off every list, by hand.

  cd backend
  uv run python scripts/opt_out.py someone@example.com "OPT-OUT: replied \"unsubscribe\" to the day-10 email on 2026-10-02"
  uv run python scripts/opt_out.py someone@example.com "BOUNCE: 550 5.1.1 address not found, 2026-10-02" --bounce

Does two things, both safe to repeat:

  1. adds the address to email_do_not_contact with the reason given
  2. sets marketing_opt_in = false on the matching account, if there is one

A bounce skips the second: the address is dead, the person never asked for
anything. Prints what it did and what was already so.

For /conversion-loop, which files a reply asking to stop the moment it reads
one. The admin page does the first half; nothing else did both.
"""

import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv

    load_dotenv(backend_dir / ".env")
    load_dotenv()
except ImportError:
    pass


def opt_out(db, email: str, reason: str, bounce: bool = False) -> dict:
    """Returns {"listed": bool, "account": "opted_out" | "already_out" | "none" | "left_alone"}."""
    from sqlalchemy import func

    # The whole model tree, not only the two tables used here. users carries
    # foreign keys onto organizations and others, and SQLAlchemy cannot build
    # a query on User until every table those point at is registered. The
    # tests never saw this: their fixture imports Organization itself. The
    # first real run did (2026-09-29), on an actor who had asked to stop.
    import app.main  # noqa: F401
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("email")
    ap.add_argument("reason")
    ap.add_argument("--bounce", action="store_true", help="a dead address: list it, leave the account alone")
    args = ap.parse_args()

    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        did = opt_out(db, args.email, args.reason, bounce=args.bounce)
    finally:
        db.close()
    print(
        f"{args.email.strip().lower()}: "
        f"{'added to do-not-contact' if did['listed'] else 'already on do-not-contact'}; "
        f"account {did['account'].replace('_', ' ')}"
    )


if __name__ == "__main__":
    main()
