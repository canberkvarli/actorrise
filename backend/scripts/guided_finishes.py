"""The guided first scene by scene and part, counting people. Read only.

  cd backend
  uv run python scripts/guided_finishes.py                    # since 2026-11-03, the three scenes
  uv run python scripts/guided_finishes.py --since 2026-10-01
  uv run python scripts/remote.py guided_finishes --since 2026-11-03   # from a cloud session

"Finished" is spoken (app/services/rehearsal/spoken.py): reached the end AND at
least half the actor's lines heard. "Reached the end" is the raw `completed`.
Staff left out. Names and addresses are never printed.
"""
import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv

    load_dotenv(backend_dir / ".env")
    load_dotenv()
except ImportError:
    pass

# The day the three keyed scenes and the unheard panel shipped (2f52a4f).
DEFAULT_SINCE = "2026-11-03"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default=DEFAULT_SINCE, help="YYYY-MM-DD, runs started on or after (UTC)")
    args = ap.parse_args()
    since = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session

    from app.services.rehearsal.guided_report import as_table, breakdown

    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect().execution_options(postgresql_readonly=True) as conn:
        if conn.execute(text("show transaction_read_only")).scalar() != "on":
            raise SystemExit("refusing to run: the connection is not read-only")
        db = Session(bind=conn)
        print(f"# Guided first scene since {args.since}, people\n")
        print(as_table(breakdown(db, since)))


if __name__ == "__main__":
    main()
