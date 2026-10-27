"""What actors asked Cue: handoffs and repeated questions. Read only.

    cd backend && uv run python scripts/cue_report.py            # since yesterday 00:00 UTC
    cd backend && uv run python scripts/cue_report.py --days 7

Used by /conversion-loop (step 2b). Handoffs come first, with the conversation,
because those are the ones waiting on Canberk. Then questions that more than one
actor asked, which is where the fact sheet or the app is missing something.
"""

import argparse
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal  # noqa: E402
from app.models.cue import CueConversation, CueMessage  # noqa: E402
from app.models.user import User  # noqa: E402


def norm(q: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", q.lower()).strip()[:80]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=1)
    args = ap.parse_args()
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    since = today - timedelta(days=args.days)

    db = SessionLocal()
    db.connection(execution_options={"postgresql_readonly": True})
    try:
        convs = (
            db.query(CueConversation, User.email)
            .join(User, User.id == CueConversation.user_id)
            .filter(CueConversation.last_at >= since)
            .order_by(CueConversation.handoff_at.isnot(None).desc(), CueConversation.last_at.desc())
            .all()
        )
        asked = (
            db.query(CueMessage.content)
            .filter(CueMessage.role == "user", CueMessage.created_at >= since)
            .all()
        )
        print(f"Cue since {since:%Y-%m-%d}: {len(convs)} conversations, {len(asked)} questions")

        handoffs = [(c, e) for c, e in convs if c.handoff_at]
        print(f"\nHANDOFFS ({len(handoffs)})")
        for c, email in handoffs:
            seen = "read" if c.read_at else "UNREAD"
            print(f"\n- [{c.handoff_reason}] {email} · conv {c.id} · {seen}")
            for m in c.messages:
                who = "them" if m.role == "user" else "Cue"
                print(f"    {who}: {m.content[:400]}")

        counts = Counter(norm(q) for (q,) in asked if q.strip())
        repeated = [(q, n) for q, n in counts.most_common(20) if n > 1]
        print(f"\nREPEATED QUESTIONS ({len(repeated)})")
        for q, n in repeated:
            print(f"- {n}x  {q}")

        tools = Counter(
            t for (ts,) in db.query(CueMessage.tools).filter(CueMessage.created_at >= since).all() for t in (ts or [])
        )
        print("\nTOOLS USED: " + (", ".join(f"{t} {n}" for t, n in tools.most_common()) or "none"))
    finally:
        db.close()


if __name__ == "__main__":
    main()
