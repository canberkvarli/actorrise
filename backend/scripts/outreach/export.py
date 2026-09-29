"""Write the founder outreach lists as CSV.

  cd backend
  uv run python scripts/outreach/export.py             # both, to <repo>/outreach/founder/
  uv run python scripts/outreach/export.py heavy_users
  uv run python scripts/outreach/export.py --out /somewhere/else

Reads only: the connection is opened read-only and the two queries are the
.sql files beside this one. The CSVs carry names and email addresses, which is
why outreach/founder/ is in .gitignore. Nothing here sends anything. Canberk
writes to these people by hand from Gmail.
"""

import argparse
import csv
import os
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
backend_dir = here.parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv

    load_dotenv(backend_dir / ".env")
    load_dotenv()
except ImportError:
    pass

LISTS = ("heavy_users", "bounced_users")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("which", nargs="?", choices=LISTS)
    ap.add_argument("--out", type=Path, default=backend_dir.parent / "outreach" / "founder")
    args = ap.parse_args()

    from sqlalchemy import create_engine, text

    # Read-only, and actually so. The database is reached through Supabase's
    # pooler (port 6543), which throws away startup options: passing
    # "-c default_transaction_read_only=on" connects without complaint and
    # leaves the session writable. Found 2026-09-29 by asking the server
    # (`show transaction_read_only` said off). postgresql_readonly is set on the
    # transaction itself, and a write is refused.
    engine = create_engine(os.environ["DATABASE_URL"])
    args.out.mkdir(parents=True, exist_ok=True)

    for name in [args.which] if args.which else LISTS:
        sql = (here / f"{name}.sql").read_text(encoding="utf-8")
        with engine.connect().execution_options(postgresql_readonly=True) as conn:
            if conn.execute(text("show transaction_read_only")).scalar() != "on":
                raise SystemExit("refusing to run: the connection is not read-only")
            result = conn.execute(text(sql))
            columns = list(result.keys())
            rows = result.fetchall()
        path = args.out / f"{name}.csv"
        with path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.writer(fh)
            writer.writerow(columns)
            writer.writerows(rows)
        print(f"{name}: {len(rows)} rows -> {path}")


if __name__ == "__main__":
    main()
