#!/usr/bin/env python
"""
Migration: studio_roles, the Studio notebook synced to the account (CAN-17).

New table only, RLS on with no policies. The API also runs these same
statements at startup (app/main.py::_ensure_rls_tables), so the table never
exists without RLS; this script is for running it by hand first, safe before
or after the deploy.

Usage:
    uv run python scripts/add_studio_roles_table.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import engine  # noqa: E402
from app.models.studio import DDL  # noqa: E402


def main() -> None:
    with engine.begin() as conn:
        for stmt in DDL:
            conn.execute(stmt)
    print("Done: studio_roles exists, RLS on.")


if __name__ == "__main__":
    main()
