"""
Admin email management endpoints.

Allows moderators to preview email templates and send emails
to individual users or targeted campaigns.
"""

import logging
import threading
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import SessionLocal, get_db
from app.models.billing import AdminAuditLog
from app.models.email_tracking import EmailBatch, EmailSend
from app.models.user import User
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

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/admin/emails", tags=["admin", "emails"])


# ========================================
# Dependencies
# ========================================

def require_moderator(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_moderator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have moderator permissions",
        )
    return current_user


def require_approval_permission(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.can_approve_submissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to send emails",
        )
    return current_user


# ========================================
# Template metadata registry
# ========================================

TEMPLATES = [
    {
        "id": "welcome",
        "name": "Welcome",
        "description": "Sent to new users on signup",
        "subject": "Welcome to ActorRise!",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
        ],
    },
    {
        "id": "upgrade_nudge",
        "name": "Upgrade Nudge",
        "description": "Encourages free-tier users to upgrade when nearing their search limit",
        "subject": "Unlock more with ActorRise Plus",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
            {"name": "searches_used", "label": "Searches used", "type": "number", "default": 8, "required": True},
            {"name": "searches_limit", "label": "Search limit", "type": "number", "default": 10, "required": True},
        ],
    },
    {
        "id": "feature_announcement",
        "name": "Feature Announcement",
        "description": "Announce a new feature to users",
        "subject": "What's new on ActorRise",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
            {"name": "feature_title", "label": "Feature title", "type": "text", "default": "New Feature", "required": True},
            {"name": "feature_description", "label": "Description", "type": "text", "default": "Check out what's new on ActorRise.", "required": True},
            {"name": "cta_text", "label": "CTA button text", "type": "text", "default": "Learn more", "required": True},
            {"name": "cta_url", "label": "CTA button URL", "type": "url", "default": "https://actorrise.com", "required": True},
            {"name": "video_url", "label": "Video URL (optional)", "type": "url", "default": "", "required": False},
        ],
    },
    {
        "id": "founder_offer",
        "name": "Founder Offer",
        "description": "12 months of Plus free for early users, asks for testimony + audience share",
        "subject": "A special offer just for you",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
            {"name": "intro_text", "label": "Main message", "type": "text", "default": "I wanted to reach out personally. I'm an actor too, and I built ActorRise because I couldn't find the tools I needed. You signed up early and that means a lot to me.", "required": True},
            {"name": "body_text", "label": "Extra paragraph (optional)", "type": "text", "default": "", "required": False},
            {"name": "promo_code", "label": "Promo code", "type": "text", "default": "FOUNDER", "required": True},
            {"name": "discount_description", "label": "Discount details", "type": "text", "default": "Enter this at checkout", "required": True},
            {"name": "upgrade_url", "label": "Upgrade URL", "type": "url", "default": "https://actorrise.com/pricing", "required": True},
            {"name": "sender_name", "label": "Sender name", "type": "text", "default": "Canberk", "required": True},
            {"name": "sender_title", "label": "Sender title", "type": "text", "default": "Founder, ActorRise", "required": True},
            {"name": "share_text", "label": "Share blurb (optional)", "type": "text", "default": "", "required": False},
            {"name": "share_url", "label": "Share URL (optional)", "type": "url", "default": "https://actorrise.com", "required": False},
        ],
    },
    {
        "id": "actor_page",
        "name": "Actor Page",
        "description": "Personal outreach about the actor profile page feature",
        "subject": "Your actor page on ActorRise",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
            {"name": "intro_text", "label": "Main message", "type": "text", "default": "I'm building actor pages on ActorRise where you can showcase your work, link your socials, and let people reach out to you directly. I'd love to set yours up.", "required": True},
            {"name": "step_1", "label": "Step 1", "type": "text", "default": "Sign up or log in at actorrise.com", "required": True},
            {"name": "step_2", "label": "Step 2", "type": "text", "default": "Go to your profile and fill in your bio, headshot, and links", "required": True},
            {"name": "step_3", "label": "Step 3", "type": "text", "default": "Your page goes live and anyone can find you", "required": True},
            {"name": "page_url", "label": "Their page URL (optional)", "type": "url", "default": "", "required": False},
            {"name": "cta_text", "label": "Button text", "type": "text", "default": "Check out your page", "required": False},
            {"name": "extra_text", "label": "Extra text below button (optional)", "type": "text", "default": "", "required": False},
            {"name": "sender_name", "label": "Sender name", "type": "text", "default": "Canberk", "required": True},
            {"name": "sender_title", "label": "Sender title", "type": "text", "default": "Founder | Actor, ActorRise", "required": True},
        ],
    },
    {
        "id": "cold_outreach",
        "name": "Cold Outreach",
        "description": "Personal outreach to recruit actors (e.g. from Backstage)",
        "subject": "hey from ActorRise",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
            {"name": "intro_text", "label": "Main message", "type": "text", "default": "I found your profile on Backstage and really liked your work. I'm building a platform called ActorRise where actors can find and rehearse monologues, get a personal profile page, and connect with other actors. I think you'd be a great fit.", "required": True},
            {"name": "body_text", "label": "Extra paragraph (optional)", "type": "text", "default": "", "required": False},
            {"name": "cta_text", "label": "Button text", "type": "text", "default": "Check it out", "required": False},
            {"name": "cta_url", "label": "Button URL", "type": "url", "default": "https://actorrise.com", "required": False},
            {"name": "closing_text", "label": "Closing line (optional)", "type": "text", "default": "", "required": False},
            {"name": "sender_name", "label": "Sender name", "type": "text", "default": "Canberk", "required": True},
            {"name": "sender_title", "label": "Sender title", "type": "text", "default": "Founder | Actor, ActorRise", "required": True},
        ],
    },
    {
        "id": "weekly_engagement",
        "name": "Weekly Engagement",
        "description": "Weekly digest with a featured monologue and acting tip",
        "subject": "Your weekly pick from ActorRise",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
            {"name": "monologue_title", "label": "Monologue title", "type": "text", "default": "To be, or not to be", "required": False},
            {"name": "monologue_snippet", "label": "Monologue excerpt", "type": "text", "default": "Whether 'tis nobler in the mind to suffer...", "required": False},
            {"name": "monologue_url", "label": "Monologue URL", "type": "url", "default": "https://actorrise.com/monologues", "required": False},
            {"name": "tip_title", "label": "Tip title", "type": "text", "default": "Cold read tip", "required": False},
            {"name": "tip_body", "label": "Tip body", "type": "text", "default": "Read the monologue once silently, then once aloud.", "required": False},
        ],
    },
]


# ========================================
# Request / response models
# ========================================

class PreviewRequest(BaseModel):
    template_id: str
    variables: dict[str, Any] = {}


class PreviewResponse(BaseModel):
    html: str
    subject: str


class SendRequest(BaseModel):
    template_id: str
    to: str
    subject: Optional[str] = None
    variables: dict[str, Any] = {}


class BulkRecipient(BaseModel):
    email: str
    name: str = ""


class BulkSendRequest(BaseModel):
    template_id: str
    recipients: list[BulkRecipient]
    subject: Optional[str] = None
    variables: dict[str, Any] = {}
    campaign_key: Optional[str] = None
    scheduled_at: Optional[str] = None  # ISO datetime string


class BatchStatusResponse(BaseModel):
    batch_id: int
    status: str
    total: int
    sent: int
    skipped: int
    errors: list[str]
    sends: list[dict[str, Any]] = []


class CampaignRequest(BaseModel):
    template_id: str
    target: str = "all"
    dry_run: bool = False
    variables: dict[str, Any] = {}


class CampaignResponse(BaseModel):
    sent: int
    skipped: int
    errors: list[str]
    recipients: list[str]


# ========================================
# Rendering helper
# ========================================

def _render_template(template_id: str, variables: dict[str, Any]) -> tuple[str, str]:
    """Render a template by ID, returning (html, subject)."""
    templates = EmailTemplates()
    meta = next((t for t in TEMPLATES if t["id"] == template_id), None)
    if not meta:
        raise HTTPException(status_code=400, detail=f"Unknown template: {template_id}")

    # Build kwargs with defaults
    kwargs: dict[str, Any] = {}
    for var in meta["variables"]:
        val = variables.get(var["name"])
        if val is None or val == "":
            val = var.get("default")
        if var["type"] == "number" and val is not None:
            try:
                val = int(val)
            except (ValueError, TypeError):
                pass
        kwargs[var["name"]] = val

    # Add unsubscribe_url placeholder for preview
    kwargs["unsubscribe_url"] = variables.get("unsubscribe_url", "#unsubscribe")

    render_map = {
        "welcome": templates.render_welcome,
        "upgrade_nudge": templates.render_upgrade_nudge,
        "feature_announcement": templates.render_feature_announcement,
        "founder_offer": templates.render_founder_offer,
        "actor_page": templates.render_actor_page,
        "cold_outreach": templates.render_cold_outreach,
        "weekly_engagement": templates.render_weekly_engagement,
    }

    render_fn = render_map.get(template_id)
    if not render_fn:
        raise HTTPException(status_code=400, detail=f"No renderer for template: {template_id}")

    html = render_fn(**kwargs)
    subject = variables.get("subject") or meta["subject"]

    return html, subject


# ========================================
# Endpoints
# ========================================

@router.get("/templates")
def list_templates(
    _user: User = Depends(require_moderator),
):
    """List all available email templates with metadata."""
    return TEMPLATES


@router.post("/preview", response_model=PreviewResponse)
def preview_template(
    body: PreviewRequest,
    _user: User = Depends(require_moderator),
):
    """Render a template preview with the given variables."""
    html, subject = _render_template(body.template_id, body.variables)
    return PreviewResponse(html=html, subject=subject)


@router.post("/send")
def send_email(
    body: SendRequest,
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Send an email to a single user."""
    html, default_subject = _render_template(body.template_id, body.variables)
    subject = body.subject or default_subject

    # Use real unsubscribe URL for the recipient
    unsub_url = build_unsubscribe_url(body.to)
    body.variables["unsubscribe_url"] = unsub_url
    html, _ = _render_template(body.template_id, body.variables)

    client = ResendEmailClient()
    result = client.send_email(to=body.to, subject=subject, html=html)

    # Audit log
    target_user = db.query(User).filter(User.email == body.to).first()
    if target_user:
        audit = AdminAuditLog(
            actor_admin_id=admin.id,
            target_user_id=target_user.id,
            action_type="email_sent",
            after_json={"template": body.template_id, "subject": subject},
        )
        db.add(audit)
        db.commit()

    return {"ok": True, "result": result}


@router.post("/bulk-send", status_code=202)
def bulk_send_email(
    body: BulkSendRequest,
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Start a bulk email send. Returns batch_id immediately, processes in background."""
    if not body.recipients:
        raise HTTPException(status_code=400, detail="No recipients provided")

    _, default_subject = _render_template(body.template_id, body.variables)
    subject = body.subject or default_subject

    # Create batch
    batch = EmailBatch(
        template_id=body.template_id,
        campaign_key=body.campaign_key or None,
        subject=subject,
        status="pending",
        total=len(body.recipients),
        created_by=admin.id,
        scheduled_at=body.scheduled_at,
    )
    db.add(batch)
    db.flush()

    default_name = body.variables.get("user_name", "there")
    skipped_dupes = 0
    seen_in_batch: set[str] = set()

    for recipient in body.recipients:
        email_addr = recipient.email.strip().lower()
        if not email_addr:
            continue

        # Dedup within this batch (e.g. pasted same email twice)
        if email_addr in seen_in_batch:
            skipped_dupes += 1
            continue
        seen_in_batch.add(email_addr)

        # Cross-batch dedup: skip if same email + campaign_key already sent
        if body.campaign_key:
            existing = (
                db.query(EmailSend)
                .join(EmailBatch)
                .filter(
                    EmailSend.to_email == email_addr,
                    EmailBatch.campaign_key == body.campaign_key,
                    EmailSend.status.notin_(["failed"]),
                )
                .first()
            )
            if existing:
                skipped_dupes += 1
                continue

        # Resolve name: typed > DB > default
        name = recipient.name.strip() if recipient.name else ""
        if not name:
            user = db.query(User).filter(User.email == email_addr).first()
            name = (user.name if user else "") or default_name

        send = EmailSend(
            batch_id=batch.id,
            to_email=email_addr,
            to_name=name,
            status="queued",
        )
        db.add(send)

    batch.skipped = skipped_dupes
    batch.total = batch.total - skipped_dupes
    if skipped_dupes > 0:
        batch.errors_json = [f"{skipped_dupes} duplicate(s) skipped (campaign: {body.campaign_key})"]
    db.commit()

    batch_id = batch.id

    # Spawn background thread to process sends
    def _process_batch():
        db2 = SessionLocal()
        try:
            b = db2.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
            if not b:
                return
            b.status = "processing"
            db2.commit()

            client = ResendEmailClient()
            sends = db2.query(EmailSend).filter(
                EmailSend.batch_id == batch_id,
                EmailSend.status == "queued",
            ).all()

            for send_row in sends:
                try:
                    vars_copy = dict(body.variables)
                    vars_copy["unsubscribe_url"] = build_unsubscribe_url(send_row.to_email)
                    vars_copy["user_name"] = send_row.to_name or default_name

                    html, _ = _render_template(body.template_id, vars_copy)

                    response = client.send_email(
                        to=send_row.to_email,
                        subject=subject,
                        html=html,
                        scheduled_at=body.scheduled_at or None,
                    )

                    send_row.resend_email_id = response.get("id") if isinstance(response, dict) else None
                    send_row.status = "sent"
                    b.sent += 1
                except Exception as e:
                    send_row.status = "failed"
                    b.skipped += 1
                    errors = list(b.errors_json or [])
                    errors.append(f"{send_row.to_email}: {e}")
                    b.errors_json = errors
                    logger.warning("Failed to send to %s: %s", send_row.to_email, e)

                db2.commit()
                time.sleep(0.5)  # Respect Resend rate limit (2 req/sec)

            b.status = "completed"
            db2.commit()

            # Audit log
            if b.sent > 0:
                audit = AdminAuditLog(
                    actor_admin_id=b.created_by,
                    target_user_id=b.created_by,
                    action_type="bulk_email_sent",
                    after_json={
                        "template": b.template_id,
                        "subject": b.subject,
                        "sent": b.sent,
                        "total": b.total,
                        "campaign_key": b.campaign_key,
                    },
                )
                db2.add(audit)
                db2.commit()

        except Exception as e:
            logger.exception("Batch %s failed: %s", batch_id, e)
            try:
                b = db2.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
                if b:
                    b.status = "failed"
                    db2.commit()
            except Exception:
                pass
        finally:
            db2.close()

    t = threading.Thread(target=_process_batch, daemon=True)
    t.start()

    return {"batch_id": batch_id, "status": "pending", "total": batch.total}


@router.get("/batch/{batch_id}", response_model=BatchStatusResponse)
def get_batch_status(
    batch_id: int,
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """Poll the status of a bulk email batch."""
    batch = db.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    sends = db.query(EmailSend).filter(EmailSend.batch_id == batch_id).all()

    return BatchStatusResponse(
        batch_id=batch.id,
        status=batch.status,
        total=batch.total,
        sent=batch.sent,
        skipped=batch.skipped,
        errors=list(batch.errors_json or []),
        sends=[
            {
                "email": s.to_email,
                "name": s.to_name,
                "status": s.status,
                "resend_id": s.resend_email_id,
                "opened_at": s.opened_at.isoformat() if s.opened_at else None,
                "clicked_at": s.clicked_at.isoformat() if s.clicked_at else None,
            }
            for s in sends
        ],
    )


@router.get("/batches")
def list_batches(
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """List recent email batches (newest first)."""
    batches = (
        db.query(EmailBatch)
        .order_by(EmailBatch.created_at.desc())
        .limit(20)
        .all()
    )

    results = []
    for b in batches:
        sends = db.query(EmailSend).filter(EmailSend.batch_id == b.id).all()
        status_counts: dict[str, int] = {}
        for s in sends:
            status_counts[s.status] = status_counts.get(s.status, 0) + 1

        # Auto-recover stuck batches: if no queued sends remain but status is still processing
        if b.status == "processing" and status_counts.get("queued", 0) == 0 and sends:
            b.status = "completed"
            b.sent = sum(1 for s in sends if s.status not in ("failed", "queued"))
            db.commit()

        results.append({
            "batch_id": b.id,
            "template_id": b.template_id,
            "campaign_key": b.campaign_key,
            "subject": b.subject,
            "status": b.status,
            "total": b.total,
            "sent": b.sent,
            "skipped": b.skipped,
            "scheduled_at": b.scheduled_at.isoformat() if b.scheduled_at else None,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "status_counts": status_counts,
        })

    return results


@router.post("/campaign", response_model=CampaignResponse)
def send_campaign_endpoint(
    body: CampaignRequest,
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Send a campaign to a user segment."""
    if body.target not in ("all", "free", "paid", "all_users", "all_free"):
        raise HTTPException(status_code=400, detail="target must be all, free, or paid")

    campaign_type = body.template_id

    # Upgrade nudge uses per-user real usage data
    if campaign_type == "upgrade_nudge":
        result = _send_upgrade_nudge_campaign(db, body.target, body.dry_run)
    else:
        # Map variable names to what send_campaign expects
        kwargs = dict(body.variables)
        result = send_campaign(
            db=db,
            campaign_type=campaign_type,
            target=body.target,
            dry_run=body.dry_run,
            **kwargs,
        )

    # Audit log for non-dry-run campaigns
    if not body.dry_run and result.get("sent", 0) > 0:
        audit = AdminAuditLog(
            actor_admin_id=admin.id,
            target_user_id=admin.id,  # self-ref for campaigns
            action_type="campaign_sent",
            after_json={
                "template": campaign_type,
                "target": body.target,
                "sent": result["sent"],
                "skipped": result["skipped"],
            },
        )
        db.add(audit)
        db.commit()

    return CampaignResponse(
        sent=result.get("sent", 0),
        skipped=result.get("skipped", 0),
        errors=result.get("errors", []),
        recipients=result.get("recipients", []),
    )
