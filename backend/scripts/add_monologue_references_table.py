#!/usr/bin/env python
"""
Migration: monologue_references, the published pieces we point at but do not
hold (CAN-24). No text column, on purpose.

New table only, RLS on with no policies. The API also runs these statements at
startup (app/main.py::_ensure_rls_tables), so the table never exists without
RLS; this script is for running it by hand first, safe before or after deploy.

Usage:
    uv run python scripts/add_monologue_references_table.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import engine  # noqa: E402
from app.models.monologue_reference import DDL  # noqa: E402


def main() -> None:
    with engine.begin() as conn:
        for stmt in DDL:
            conn.execute(stmt)
    print("Done: monologue_references exists, RLS on.")


if __name__ == "__main__":
    main()
