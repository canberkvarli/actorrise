"""Day-1 "you saved a piece" re-engagement — SELECTION + PREVIEW tool.

Sends NOTHING by default. Approved copy: email-draft-day1-saved-piece-2026-08-26.md
(repo root). Backs H-14: savers return 2.1x more; this pulls a saver back before
the save goes cold.

Eligible recipient: a user who saved a monologue between --hours-max and
--hours-min ago, still saved (removed_at IS NULL), with NO activity since that
save (no search_logs and no monologue_views after it), on the free tier, opted in
to marketing, not in email_do_not_contact, and not an @actorrise.com / Apple-relay
address. Personalised to their most recent qualifying save.

  uv run python scripts/send_saved_piece_reminder.py            # DRY RUN (default)
  uv run python scripts/send_saved_piece_reminder.py --send     # sends via Resend

DRY RUN prints the cohort and writes rendered previews to --out. --send sends the
multipart (plain + html) via Resend and appends each address to a dedupe log so a
re-run never double-sends. There is no scheduler: this is a run-when-you-want tool.
Canberk runs --send after approving the copy; this script is never auto-invoked.
"""

import argparse
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.database import SessionLocal
from app.models.actor import Monologue, MonologueFavorite
from app.models.billing import PricingTier, UserSubscription
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.search_log import MonologueView, SearchLog
from app.models.user import User
from app.services.email.marketing import APPLE_RELAY_DOMAIN, build_unsubscribe_url
from app.services.email.resend_client import ResendEmailClient
from app.services.email.templates import EmailTemplates

SITE_URL = os.getenv("SITE_URL", "https://actorrise.com")
DEFAULT_SUBJECT = "your {character} monologue is still sitting there"
DEDUPE_LOG = Path(__file__).resolve().parent.parent / "backups" / "saved_piece_reminder_sent.log"


def _paid_user_ids(db) -> set[int]:
    rows = (
        db.query(UserSubscription.user_id)
        .join(PricingTier, UserSubscription.tier_id == PricingTier.id)
        .filter(UserSubscription.status.in_(["active", "trialing"]), PricingTier.name != "free")
        .all()
    )
    return {r[0] for r in rows}


def _has_activity_since(db, uid: int, since: datetime) -> bool:
    if db.query(SearchLog.id).filter(SearchLog.user_id == uid, SearchLog.created_at > since).first():
        return True
    if db.query(MonologueView.id).filter(MonologueView.user_id == uid, MonologueView.created_at > since).first():
        return True
    return False


def eligible(db, hours_min: int, hours_max: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    lo, hi = now - timedelta(hours=hours_max), now - timedelta(hours=hours_min)
    favs = (
        db.query(MonologueFavorite)
        .filter(
            MonologueFavorite.removed_at.is_(None),
            MonologueFavorite.created_at >= lo,
            MonologueFavorite.created_at <= hi,
        )
        .order_by(MonologueFavorite.user_id, MonologueFavorite.created_at.desc())
        .all()
    )
    paid = _paid_user_ids(db)
    dnc = {row[0].lower() for row in db.query(EmailDoNotContact.email).all() if row[0]}

    seen: set[int] = set()
    out: list[dict] = []
    for fav in favs:
        uid = fav.user_id
        if uid in seen:
            continue  # most-recent qualifying save only (favs are user, created desc)
        seen.add(uid)
        user = db.get(User, uid)
        if not user or not user.email:
            continue
        email = user.email
        if not getattr(user, "marketing_opt_in", False):
            continue
        if "@actorrise.com" in email.lower() or APPLE_RELAY_DOMAIN in email.lower():
            continue
        if email.lower() in dnc:
            continue
        if uid in paid:
            continue
        if _has_activity_since(db, uid, fav.created_at):
            continue
        mono = db.get(Monologue, fav.monologue_id)
        if not mono or not mono.play:
            continue
        out.append({
            "email": email,
            "user_name": user.name if getattr(user, "name", None) else None,
            "character": mono.character_name or "that character",
            "play": mono.play.title or "the play",
            "link": f"{SITE_URL}/monologue/{mono.id}",
            "saved_at": fav.created_at,
        })
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--send", action="store_true", help="actually send via Resend (default: dry run)")
    ap.add_argument("--hours-min", type=int, default=24)
    ap.add_argument("--hours-max", type=int, default=72)
    ap.add_argument("--subject", default=DEFAULT_SUBJECT)
    ap.add_argument("--limit", type=int, default=0, help="cap recipients (0 = no cap)")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "backups" / "saved_piece_reminder_preview.txt"))
    args = ap.parse_args()

    tpl = EmailTemplates()
    db = SessionLocal()
    try:
        people = eligible(db, args.hours_min, args.hours_max)
    finally:
        db.close()
    if args.limit:
        people = people[: args.limit]

    already = set()
    if DEDUPE_LOG.exists():
        already = {ln.strip().lower() for ln in DEDUPE_LOG.read_text().splitlines() if ln.strip()}

    print(f"eligible: {len(people)}  (saved {args.hours_min}-{args.hours_max}h ago, no activity since, free, opted-in)")
    if already:
        print(f"already sent (dedupe log): {len(already)}")

    if not args.send:
        preview = []
        for p in people[:10]:
            plain = tpl.render_saved_piece_reminder_plain(p["character"], p["play"], p["link"], p["user_name"])
            preview.append(
                f"TO: {p['email']}   (saved {p['saved_at']})\n"
                f"SUBJECT: {args.subject.format(character=p['character'], play=p['play'])}\n\n{plain}\n"
                + "=" * 70
            )
        Path(args.out).write_text("\n".join(preview), encoding="utf-8")
        print(f"DRY RUN — nothing sent. {min(len(people),10)} previews written to {args.out}")
        for p in people[:12]:
            print(f"  - {p['email']:32} {p['character']} / {p['play']}")
        print("\nTo send for real (after approving the copy): add --send")
        return

    client = ResendEmailClient()
    sent = 0
    for p in people:
        if p["email"].lower() in already:
            continue
        unsub = None
        try:
            unsub = build_unsubscribe_url(p["email"])
        except Exception:
            pass
        html = tpl.render_saved_piece_reminder(p["character"], p["play"], p["link"], p["user_name"], unsubscribe_url=unsub)
        plain = tpl.render_saved_piece_reminder_plain(p["character"], p["play"], p["link"], p["user_name"])
        subject = args.subject.format(character=p["character"], play=p["play"])
        try:
            client.send_email(to=p["email"], subject=subject, html=html, plain_text=plain, unsubscribe_url=unsub)
            with DEDUPE_LOG.open("a") as fh:
                fh.write(p["email"].lower() + "\n")
            sent += 1
            print(f"  sent -> {p['email']}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED {p['email']}: {exc}")
    print(f"done. sent {sent}.")


if __name__ == "__main__":
    main()
