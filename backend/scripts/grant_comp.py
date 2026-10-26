"""Comp people onto Plus from the terminal, the same way the admin page does.

Goes through grant_admin_user_membership, so every grant writes the same audit
row as the "Grant comp membership" card, recorded against canberk@actorrise.com.

    uv run python scripts/grant_comp.py --preset student-month a@x.com b@y.com
    uv run python scripts/grant_comp.py --preset educator-month --dry-run t@school.org

Presets match the admin page: educator-month, student-2weeks, student-month.
Each person gets the usual "you have Plus" email unless --quiet, or unless the
address is on a school district's mail system, which turns it away and costs
the sending domain its bounce rate (app/services/email/school_address.py).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
load_dotenv(backend_dir / ".env")

PRESETS = {
    "educator-month": ("educator", 30),
    "student-2weeks": ("student", 14),
    "student-month": ("student", 30),
}
ADMIN_EMAIL = "canberk@actorrise.com"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("emails", nargs="+")
    ap.add_argument("--preset", required=True, choices=sorted(PRESETS))
    ap.add_argument("--note", default="")
    ap.add_argument("--quiet", action="store_true", help="do not send the membership email")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    from app.api.admin.users import AdminGrantRequest, _expires_label, grant_admin_user_membership
    from app.core.database import SessionLocal
    import app.models  # noqa: F401  registers the mappers users.* points at
    from app.models.billing import PricingTier, UserSubscription
    from app.models.organization import Organization  # noqa: F401  not in app.models
    from app.models.user import User
    from app.services.email.notifications import send_membership_granted_email
    from app.services.email.school_address import is_district_address

    account_type, days = PRESETS[args.preset]
    db = SessionLocal()
    admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    plus = db.query(PricingTier).filter(PricingTier.name == "plus").first()
    if admin is None or plus is None:
        sys.exit("admin account or plus tier not found")

    for email in args.emails:
        user = db.query(User).filter(User.email.ilike(email.strip())).first()
        if user is None:
            print(f"{email}: no account, skipped")
            continue
        if args.dry_run:
            print(f"{email}: would grant Plus for {days} days as {account_type}")
            continue
        grant_admin_user_membership(
            user.id,
            AdminGrantRequest(
                tier_id=plus.id,
                duration_days=days,
                account_type=account_type,
                notify=False,  # sent below, in this process, so it is not lost on exit
                note=args.note or f"{args.preset} via scripts/grant_comp.py",
            ),
            admin=admin,
            db=db,
        )
        sub = db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()
        mailed = ""
        if not args.quiet and is_district_address(user.email):
            mailed = ", not emailed (district inbox)"
        elif not args.quiet:
            r = send_membership_granted_email(
                user_email=user.email,
                user_name=user.name,
                tier_display_name=plus.display_name,
                expires_label=_expires_label(sub.trial_end),
                account_type=user.account_type,
            )
            mailed = f", emailed ({r.get('status', 'sent') if isinstance(r, dict) else 'sent'})"
        print(f"{email}: Plus until {sub.trial_end:%Y-%m-%d}{mailed}")


if __name__ == "__main__":
    main()
