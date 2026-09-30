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
one. The unsubscribe link does the same thing by itself since 2026-09-30;
the work lives in app.services.email.opt_out so both paths agree. Start the
reason with OPT-OUT: when the person asked, so the resubscribe link can undo it.
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

from app.services.email.opt_out import opt_out  # noqa: E402,F401  (tests import it from here)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("email")
    ap.add_argument("reason")
    ap.add_argument("--bounce", action="store_true", help="a dead address: list it, leave the account alone")
    args = ap.parse_args()

    # The whole model tree, not only the two tables used here. users carries
    # foreign keys onto organizations and others, and SQLAlchemy cannot build
    # a query on User until every table those point at is registered. The
    # first real run (2026-09-29) crashed on this, on an actor who had asked to stop.
    import app.main  # noqa: F401
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
