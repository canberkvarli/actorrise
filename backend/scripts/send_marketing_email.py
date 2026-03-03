"""
Send marketing emails to opted-in users.

Usage:
  cd backend

  # Dry run — list recipients without sending
  uv run python scripts/send_marketing_email.py upgrade-nudge --target free --dry-run

  # Send upgrade nudge to free users
  uv run python scripts/send_marketing_email.py upgrade-nudge --target free

  # Feature announcement to everyone
  uv run python scripts/send_marketing_email.py feature-announcement --target all \
      --title "ScenePartner AI is here" \
      --description "Rehearse any scene with an AI scene partner that reads the other lines." \
      --cta-text "Try ScenePartner" \
      --cta-url "https://actorrise.com/scene-partner"

  # Feature announcement with video
  uv run python scripts/send_marketing_email.py feature-announcement --target all \
      --title "ScenePartner AI" \
      --description "Watch what it can do." \
      --cta-text "Try it now" \
      --cta-url "https://actorrise.com/scene-partner" \
      --video-url "https://www.youtube.com/watch?v=..."

  # Weekly engagement digest
  uv run python scripts/send_marketing_email.py weekly-engagement --target all \
      --monologue-title "To be, or not to be" \
      --monologue-snippet "Whether 'tis nobler in the mind to suffer..." \
      --monologue-url "https://actorrise.com/monologues/123" \
      --tip-title "Cold read tip" \
      --tip-body "Read the monologue once silently, then read it aloud."

  # Send a single test email to yourself
  uv run python scripts/send_marketing_email.py test --to your@email.com --campaign upgrade-nudge
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

from app.core.database import SessionLocal
from app.services.email.marketing import (
    _get_ai_search_limit,
    _get_marketing_recipients,
    _get_monthly_ai_searches,
    _send_upgrade_nudge_campaign,
    build_unsubscribe_url,
    send_campaign,
)
from app.services.email.resend_client import ResendEmailClient
from app.services.email.templates import EmailTemplates


def _send_test(args):
    """Send a single test marketing email to a specific address."""
    templates = EmailTemplates()
    client = ResendEmailClient()
    unsub_url = build_unsubscribe_url(args.to)

    render_map = {
        "upgrade-nudge": lambda: templates.render_upgrade_nudge(
            user_name="Test User",
            searches_used=8,
            searches_limit=10,
            unsubscribe_url=unsub_url,
        ),
        "feature-announcement": lambda: templates.render_feature_announcement(
            user_name="Test User",
            feature_title=args.title or "New Feature",
            feature_description=args.description or "Check out what's new on ActorRise.",
            cta_text=args.cta_text or "Learn more",
            cta_url=args.cta_url or "https://actorrise.com",
            video_url=args.video_url,
            unsubscribe_url=unsub_url,
        ),
        "founder-offer": lambda: templates.render_founder_offer(
            user_name="Test User",
            promo_code=getattr(args, "promo_code", None) or "FOUNDER",
            discount_description=getattr(args, "discount_description", None) or "Enter at checkout for 12 months of Plus, completely free",
            upgrade_url=getattr(args, "upgrade_url", None) or "https://actorrise.com/pricing",
            sender_name=getattr(args, "sender_name", None) or "Canberk",
            sender_title=getattr(args, "sender_title", None) or "Founder, ActorRise",
            share_text=getattr(args, "share_text", None),
            share_url=getattr(args, "share_url", None),
            unsubscribe_url=unsub_url,
        ),
        "weekly-engagement": lambda: templates.render_weekly_engagement(
            user_name="Test User",
            monologue_title=args.monologue_title or "To be, or not to be",
            monologue_snippet=args.monologue_snippet or "Whether 'tis nobler in the mind to suffer...",
            monologue_url=args.monologue_url or "https://actorrise.com/monologues",
            tip_title=args.tip_title or "Cold read tip",
            tip_body=args.tip_body or "Read the monologue once silently, then once aloud.",
            unsubscribe_url=unsub_url,
        ),
    }

    campaign = args.campaign
    if campaign not in render_map:
        print(f"Unknown campaign: {campaign}. Options: {', '.join(render_map.keys())}")
        sys.exit(1)

    subject_map = {
        "upgrade-nudge": "Unlock more with ActorRise Plus",
        "feature-announcement": args.title or "What's new on ActorRise",
        "founder-offer": "A special offer just for you",
        "weekly-engagement": "Your weekly pick from ActorRise",
    }

    html = render_map[campaign]()
    print(f"Sending test '{campaign}' email to {args.to}...")
    result = client.send_email(to=args.to, subject=subject_map[campaign], html=html)
    print("Result:", result)
    print("Done. Check your inbox.")


def _send_campaign(args):
    """Send a marketing campaign to opted-in users."""
    campaign_type = args.command.replace("-", "_")
    db = SessionLocal()

    try:
        # Upgrade nudge is special — uses per-user real usage data
        if campaign_type == "upgrade_nudge":
            result = _send_upgrade_nudge_campaign(db, args.target, args.dry_run)
        else:
            kwargs = {}
            if campaign_type == "feature_announcement":
                if not args.title or not args.description or not args.cta_text or not args.cta_url:
                    print("Feature announcement requires --title, --description, --cta-text, --cta-url")
                    sys.exit(1)
                kwargs = {
                    "feature_title": args.title,
                    "feature_description": args.description,
                    "cta_text": args.cta_text,
                    "cta_url": args.cta_url,
                    "video_url": getattr(args, "video_url", None),
                }
            elif campaign_type == "founder_offer":
                kwargs = {
                    "promo_code": getattr(args, "promo_code", None) or "FOUNDER",
                    "discount_description": getattr(args, "discount_description", None) or "Use at checkout for your exclusive discount",
                    "upgrade_url": getattr(args, "upgrade_url", None) or "https://actorrise.com/pricing",
                    "sender_name": getattr(args, "sender_name", None) or "Canberk",
                    "sender_title": getattr(args, "sender_title", None) or "Founder, ActorRise",
                    "share_text": getattr(args, "share_text", None),
                    "share_url": getattr(args, "share_url", None),
                }
            elif campaign_type == "weekly_engagement":
                kwargs = {
                    "monologue_title": getattr(args, "monologue_title", None),
                    "monologue_snippet": getattr(args, "monologue_snippet", None),
                    "monologue_url": getattr(args, "monologue_url", None),
                    "tip_title": getattr(args, "tip_title", None),
                    "tip_body": getattr(args, "tip_body", None),
                }

            result = send_campaign(
                db=db,
                campaign_type=campaign_type,
                target=args.target,
                dry_run=args.dry_run,
                **kwargs,
            )
    finally:
        db.close()

    if args.dry_run:
        print(f"\n[DRY RUN] Would send '{args.command}' to {len(result['recipients'])} recipients (target: {args.target}):")
        for email in result["recipients"]:
            print(f"  - {email}")
    else:
        print(f"\nCampaign '{args.command}' complete:")
        print(f"  Sent:    {result['sent']}")
        print(f"  Skipped: {result['skipped']}")
        if result["errors"]:
            print(f"  Errors:")
            for err in result["errors"]:
                print(f"    - {err}")


def main():
    parser = argparse.ArgumentParser(description="Send ActorRise marketing emails")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # --- test command ---
    test_parser = subparsers.add_parser("test", help="Send a single test email to yourself")
    test_parser.add_argument("--to", required=True, help="Your email address")
    test_parser.add_argument("--campaign", required=True, choices=["upgrade-nudge", "feature-announcement", "founder-offer", "weekly-engagement"])

    # --- shared campaign args ---
    for name, help_text in [
        ("upgrade-nudge", "Send upgrade nudge to free-tier users"),
        ("feature-announcement", "Send feature announcement"),
        ("founder-offer", "Send founder offer with promo code"),
        ("weekly-engagement", "Send weekly engagement digest"),
    ]:
        p = subparsers.add_parser(name, help=help_text)
        p.add_argument("--target", default="all", choices=["all", "free", "paid"], help="Target audience")
        p.add_argument("--dry-run", action="store_true", help="List recipients without sending")

    # Feature announcement args (add to both test and campaign parsers)
    for p in [test_parser, subparsers.choices["feature-announcement"]]:
        p.add_argument("--title", help="Feature title")
        p.add_argument("--description", help="Feature description")
        p.add_argument("--cta-text", help="CTA button text")
        p.add_argument("--cta-url", help="CTA button URL")
        p.add_argument("--video-url", help="Optional video URL")

    # Founder offer args
    for p in [test_parser, subparsers.choices["founder-offer"]]:
        p.add_argument("--promo-code", help="Promo code (default: FOUNDER)")
        p.add_argument("--discount-description", help="Discount details text")
        p.add_argument("--upgrade-url", help="Upgrade URL")
        p.add_argument("--sender-name", help="Sender name (default: Canberk)")
        p.add_argument("--sender-title", help="Sender title")
        p.add_argument("--share-text", help="Optional share blurb")
        p.add_argument("--share-url", help="Optional share URL")

    # Weekly engagement args
    for p in [test_parser, subparsers.choices["weekly-engagement"]]:
        p.add_argument("--monologue-title", help="Featured monologue title")
        p.add_argument("--monologue-snippet", help="Short excerpt from the monologue")
        p.add_argument("--monologue-url", help="URL to the monologue")
        p.add_argument("--tip-title", help="Weekly tip title")
        p.add_argument("--tip-body", help="Weekly tip body text")

    args = parser.parse_args()

    if args.command == "test":
        _send_test(args)
    else:
        _send_campaign(args)


if __name__ == "__main__":
    main()
