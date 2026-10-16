"""Make, list and switch off teachers' class links (app/models/class_link.py).

    uv run python scripts/class_link.py make t@school.edu --code nmu-bobby --label Bobby --school NMU
    uv run python scripts/class_link.py invite nmu-bobby a@nmu.edu b@nmu.edu
    uv run python scripts/class_link.py list
    uv run python scripts/class_link.py off nmu-bobby

`make` ties the link to the teacher's organization when their account has one.
The link is printed; it goes to the teacher, never to students directly.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
load_dotenv(backend_dir / ".env")

SITE = "https://www.actorrise.com"


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    mk = sub.add_parser("make")
    mk.add_argument("teacher_email")
    mk.add_argument("--code", required=True)
    mk.add_argument("--label", required=True, help='first name shown on the page: "Bobby"')
    mk.add_argument("--school", default=None)
    mk.add_argument("--org-id", type=int, default=None, help="defaults to the teacher's own organization")
    mk.add_argument("--days", type=int, default=30)
    mk.add_argument("--max-uses", type=int, default=60)
    inv = sub.add_parser("invite", help="approve a class list ahead of signup")
    inv.add_argument("code")
    inv.add_argument("emails", nargs="+")
    sub.add_parser("list")
    off = sub.add_parser("off")
    off.add_argument("code")
    on = sub.add_parser("on")
    on.add_argument("code")
    args = ap.parse_args()

    import app.models  # noqa: F401  registers the mappers
    from app.core.database import SessionLocal
    from app.models.class_link import ClassLink, ClassLinkInvite, ClassLinkJoin
    from app.models.organization import Organization  # noqa: F401  not in app.models
    from app.models.user import User
    from app.services.class_links import CODE_RE

    db = SessionLocal()

    if args.cmd == "make":
        code = args.code.strip().lower()
        if not CODE_RE.match(code):
            sys.exit("code: 3 to 64 lowercase letters, digits or hyphens")
        teacher = db.query(User).filter(User.email.ilike(args.teacher_email.strip())).first()
        if teacher is None:
            sys.exit(f"{args.teacher_email}: no account")
        if db.query(ClassLink).filter(ClassLink.code == code).first():
            sys.exit(f"{code}: already taken")
        link = ClassLink(
            code=code,
            teacher_user_id=teacher.id,
            organization_id=args.org_id or teacher.organization_id,
            teacher_label=args.label.strip()[:80],
            school_label=(args.school or "").strip()[:120] or None,
            days=args.days,
            max_uses=args.max_uses,
        )
        db.add(link)
        db.commit()
        print(f"{SITE}/join/{code}  ({args.days} days, up to {args.max_uses} grants)")
        return

    if args.cmd == "invite":
        from app.services.class_links import invite

        link = db.query(ClassLink).filter(ClassLink.code == args.code.strip().lower()).first()
        if link is None:
            sys.exit(f"{args.code}: no such link")
        for email, outcome in invite(db, link, args.emails).items():
            print(f"{email}: {outcome}")
        return

    if args.cmd in ("off", "on"):
        link = db.query(ClassLink).filter(ClassLink.code == args.code.strip().lower()).first()
        if link is None:
            sys.exit(f"{args.code}: no such link")
        link.active = args.cmd == "on"
        db.commit()
        print(f"{link.code}: {'on' if link.active else 'off'}")
        return

    for link in db.query(ClassLink).order_by(ClassLink.created_at).all():
        teacher = db.get(User, link.teacher_user_id)
        joins = db.query(ClassLinkJoin).filter(ClassLinkJoin.class_link_id == link.id).all()
        counts: dict[str, int] = {}
        for j in joins:
            counts[j.outcome] = counts.get(j.outcome, 0) + 1
        waiting = db.query(ClassLinkInvite).filter(
            ClassLinkInvite.class_link_id == link.id, ClassLinkInvite.claimed_at.is_(None)
        ).count()
        if waiting:
            counts["invited, no account yet"] = waiting
        tally = ", ".join(f"{k} {v}" for k, v in sorted(counts.items())) or "nobody yet"
        state = "on" if link.active else "OFF"
        print(f"{link.code:24} {state:3}  {teacher.email if teacher else '?':28} {tally}")


if __name__ == "__main__":
    main()
