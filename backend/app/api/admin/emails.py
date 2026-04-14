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
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.core.database import SessionLocal, get_db
from app.models.billing import AdminAuditLog, UserSubscription
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.email_tracking import EmailBatch, EmailSend
from app.models.user import User
from app.services.email.marketing import (
    APPLE_RELAY_DOMAIN,
    _get_ai_search_limit,
    _get_marketing_recipients,
    _get_monthly_ai_searches,
    _send_upgrade_nudge_campaign,
    build_unsubscribe_url,
    is_apple_relay_email,
    send_campaign,
)
from app.services.email.resend_client import ResendEmailClient
from app.services.email.smtp_client import SmtpEmailClient
from app.services.email.templates import EmailTemplates
from app.services.email.tracking import add_tracking


def _get_email_client(send_via: str = "smtp"):
    """Get the appropriate email client based on send_via preference."""
    if send_via == "smtp":
        try:
            return SmtpEmailClient()
        except ValueError:
            logger.warning("SMTP not configured, falling back to Resend")
            return ResendEmailClient()
    return ResendEmailClient()

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
        "id": "custom",
        "name": "Custom",
        "description": "Freeform email with Markdown support — write whatever you want",
        "subject": "hey",
        "variables": [
            {"name": "user_name", "label": "Recipient name", "type": "text", "default": "there", "required": True},
            {"name": "body_markdown", "label": "Message body (Markdown supported: **bold**, *italic*, [links](url))", "type": "text", "default": "", "required": True},
            {"name": "sender_name", "label": "Sender name", "type": "text", "default": "Canberk", "required": True},
            {"name": "sender_title", "label": "Sender title", "type": "text", "default": "Founder, ActorRise", "required": True},
        ],
    },
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
        "id": "founder_offer",
        "name": "Founder Offer",
        "description": "12 months of Plus free for early users",
        "subject": "A personal note from me",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
            {"name": "intro_text", "label": "Main message", "type": "text", "default": "I wanted to reach out personally. I'm an actor too, and I built ActorRise because I couldn't find the tools I needed. You signed up early and that means a lot to me.", "required": True},
            {"name": "body_text", "label": "Extra paragraph (optional)", "type": "text", "default": "", "required": False},
            {"name": "promo_code", "label": "Promo code", "type": "text", "default": "FOUNDER", "required": True},
            {"name": "upgrade_url", "label": "Upgrade URL", "type": "url", "default": "https://actorrise.com/pricing", "required": True},
            {"name": "sender_name", "label": "Sender name", "type": "text", "default": "Canberk", "required": True},
            {"name": "sender_title", "label": "Sender title", "type": "text", "default": "Founder, ActorRise", "required": True},
        ],
    },
    {
        "id": "founder_followup",
        "name": "Founder Follow-up",
        "description": "Follow-up for users who didn't open/click the founder offer",
        "subject": "following up",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
            {"name": "intro_text", "label": "Main message", "type": "text", "default": "Just wanted to follow up on my last email. The founder code is still active if you want to use it.", "required": True},
            {"name": "promo_code", "label": "Promo code", "type": "text", "default": "FOUNDER", "required": True},
            {"name": "upgrade_url", "label": "Upgrade URL", "type": "url", "default": "https://actorrise.com/pricing", "required": True},
            {"name": "sender_name", "label": "Sender name", "type": "text", "default": "Canberk", "required": True},
            {"name": "sender_title", "label": "Sender title", "type": "text", "default": "Founder, ActorRise", "required": True},
        ],
    },
    {
        "id": "weekly_engagement",
        "name": "Weekly Engagement",
        "description": "Weekly digest with AI-personalized monologue recommendation",
        "subject": "This week's pick",
        "variables": [
            {"name": "user_name", "label": "User name", "type": "text", "default": "there", "required": True},
            {"name": "character_analysis", "label": "AI character intro (2-3 sentences)", "type": "text", "default": "", "required": False},
            {"name": "monologue_snippet", "label": "Monologue excerpt", "type": "text", "default": "", "required": False},
            {"name": "monologue_url", "label": "Monologue URL", "type": "url", "default": "https://actorrise.com/dashboard", "required": False},
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
    send_via: str = "smtp"  # "smtp" (Google Workspace) or "resend"


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
    send_via: str = "smtp"  # "smtp" (Google Workspace) or "resend"
    skip_apple_relay: bool = True  # auto-skip @privaterelay.appleid.com addresses


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
    target: str = "all"  # "all" | "free" | "paid" | "leads"
    dry_run: bool = False
    variables: dict[str, Any] = {}
    send_via: str = "smtp"  # "smtp" (Google Workspace) or "resend"
    skip_apple_relay: bool = True  # auto-skip @privaterelay.appleid.com addresses


class CampaignResponse(BaseModel):
    sent: int
    skipped: int
    errors: list[str]
    recipients: list[str]


class DncEntryIn(BaseModel):
    email: str
    name: Optional[str] = None
    reason: Optional[str] = None


class DncBulkAddRequest(BaseModel):
    entries: list[DncEntryIn]


class DncEntryOut(BaseModel):
    id: int
    email: str
    name: Optional[str]
    reason: Optional[str]
    added_at: Optional[str]


# ========================================
# Rendering helper
# ========================================

def _render_template(template_id: str, variables: dict[str, Any]) -> tuple[str, str, Optional[str]]:
    """Render a template by ID, returning (html, subject, plain_text).

    plain_text is non-None for templates that should send as plain text
    to avoid Gmail Promotions tab.
    """
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
        "custom": templates.render_custom,
        "welcome": templates.render_welcome,
        "founder_offer": templates.render_founder_offer,
        "founder_followup": templates.render_founder_followup,
        "weekly_engagement": templates.render_weekly_engagement,
    }

    # All marketing templates send as plain text for better inbox placement
    plain_text_map = {
        "custom": templates.render_custom_plain,
        "welcome": templates.render_welcome_plain,
        "founder_offer": templates.render_founder_offer_plain,
        "founder_followup": templates.render_founder_followup_plain,
        "weekly_engagement": templates.render_weekly_engagement_plain,
    }

    render_fn = render_map.get(template_id)
    if not render_fn:
        raise HTTPException(status_code=400, detail=f"No renderer for template: {template_id}")

    html = render_fn(**kwargs)
    subject = variables.get("subject") or meta["subject"]

    plain_text = None
    plain_fn = plain_text_map.get(template_id)
    if plain_fn:
        plain_text = plain_fn(**kwargs)

    return html, subject, plain_text


# ========================================
# Do-not-contact helpers
# ========================================

def _get_dnc_emails(db: Session) -> set[str]:
    """Return the set of all do-not-contact emails (lowercased)."""
    rows = db.query(EmailDoNotContact.email).all()
    return {row[0].strip().lower() for row in rows if row[0]}


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
    html, subject, _ = _render_template(body.template_id, body.variables)
    return PreviewResponse(html=html, subject=subject)


@router.post("/send")
def send_email(
    body: SendRequest,
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Send an email to a single user."""
    html, default_subject, _ = _render_template(body.template_id, body.variables)
    subject = body.subject or default_subject

    # Use real unsubscribe URL for the recipient
    unsub_url = build_unsubscribe_url(body.to)
    body.variables["unsubscribe_url"] = unsub_url
    html, _, plain_text = _render_template(body.template_id, body.variables)

    client = _get_email_client(body.send_via)
    result = client.send_email(to=body.to, subject=subject, html=html, plain_text=plain_text)

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

    _, default_subject, _ = _render_template(body.template_id, body.variables)
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
    skipped_dnc = 0
    skipped_relay = 0
    seen_in_batch: set[str] = set()
    dnc_emails = _get_dnc_emails(db)

    for recipient in body.recipients:
        email_addr = recipient.email.strip().lower()
        if not email_addr:
            continue

        # Dedup within this batch (e.g. pasted same email twice)
        if email_addr in seen_in_batch:
            skipped_dupes += 1
            continue
        seen_in_batch.add(email_addr)

        # Skip do-not-contact entries (includes paid users, apple relay, etc)
        if email_addr in dnc_emails:
            skipped_dnc += 1
            continue

        # Skip Apple Hide-My-Email relay addresses (most don't forward reliably)
        if body.skip_apple_relay and is_apple_relay_email(email_addr):
            skipped_relay += 1
            continue

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

    total_skipped = skipped_dupes + skipped_dnc + skipped_relay
    batch.skipped = total_skipped
    batch.total = batch.total - total_skipped
    notes: list[str] = []
    if skipped_dupes > 0:
        notes.append(f"{skipped_dupes} duplicate(s) skipped (campaign: {body.campaign_key})")
    if skipped_dnc > 0:
        notes.append(f"{skipped_dnc} do-not-contact entr{'y' if skipped_dnc == 1 else 'ies'} skipped")
    if skipped_relay > 0:
        notes.append(f"{skipped_relay} Apple Hide-My-Email address(es) skipped")
    if notes:
        batch.errors_json = notes
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

            client = _get_email_client(body.send_via)
            sends = db2.query(EmailSend).filter(
                EmailSend.batch_id == batch_id,
                EmailSend.status == "queued",
            ).all()

            for send_row in sends:
                try:
                    vars_copy = dict(body.variables)
                    vars_copy["unsubscribe_url"] = build_unsubscribe_url(send_row.to_email)
                    vars_copy["user_name"] = send_row.to_name or default_name

                    html, _, plain_text = _render_template(body.template_id, vars_copy)

                    # Inject self-hosted open/click tracking
                    html, plain_text = add_tracking(send_row.id, html=html, plain_text=plain_text)

                    response = client.send_email(
                        to=send_row.to_email,
                        subject=subject,
                        html=html,
                        scheduled_at=body.scheduled_at or None,
                        plain_text=plain_text,
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
                # SMTP needs more spacing to avoid Gmail throttling
                delay = 2.0 if body.send_via == "smtp" else 0.5
                time.sleep(delay)

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


class ResumeBatchRequest(BaseModel):
    send_via: str = "smtp"  # "smtp" or "resend"


@router.post("/batch/{batch_id}/resume")
def resume_batch(
    batch_id: int,
    body: ResumeBatchRequest,
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Resume a stuck batch that has queued emails remaining."""
    batch = db.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    queued_count = db.query(EmailSend).filter(
        EmailSend.batch_id == batch_id,
        EmailSend.status == "queued",
    ).count()

    if queued_count == 0:
        raise HTTPException(status_code=400, detail="No queued emails to resume")

    # Get template metadata
    meta = next((t for t in TEMPLATES if t["id"] == batch.template_id), None)
    if not meta:
        raise HTTPException(status_code=400, detail=f"Unknown template: {batch.template_id}")

    # Spawn background thread to process remaining sends
    template_id = batch.template_id
    subject = batch.subject
    default_name = "there"

    def _resume_batch():
        db2 = SessionLocal()
        try:
            b = db2.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
            if not b:
                return
            b.status = "processing"
            db2.commit()

            client = _get_email_client(body.send_via)
            templates_svc = EmailTemplates()

            sends = db2.query(EmailSend).filter(
                EmailSend.batch_id == batch_id,
                EmailSend.status == "queued",
            ).all()

            render_map = {
                "custom": templates_svc.render_custom,
                "welcome": templates_svc.render_welcome,
                "founder_offer": templates_svc.render_founder_offer,
                "founder_followup": templates_svc.render_founder_followup,
                "weekly_engagement": templates_svc.render_weekly_engagement,
            }
            plain_text_map = {
                "custom": templates_svc.render_custom_plain,
                "welcome": templates_svc.render_welcome_plain,
                "founder_offer": templates_svc.render_founder_offer_plain,
                "founder_followup": templates_svc.render_founder_followup_plain,
                "weekly_engagement": templates_svc.render_weekly_engagement_plain,
            }

            render_fn = render_map.get(template_id)
            plain_fn = plain_text_map.get(template_id)
            if not render_fn:
                b.status = "failed"
                b.errors_json = list(b.errors_json or []) + [f"Unknown template: {template_id}"]
                db2.commit()
                return

            for send_row in sends:
                try:
                    vars_copy = {
                        "unsubscribe_url": build_unsubscribe_url(send_row.to_email),
                        "user_name": send_row.to_name or default_name,
                    }

                    html = render_fn(**vars_copy)
                    plain_text = plain_fn(**vars_copy) if plain_fn else None

                    # Inject self-hosted open/click tracking
                    html, plain_text = add_tracking(send_row.id, html=html, plain_text=plain_text)

                    response = client.send_email(
                        to=send_row.to_email,
                        subject=subject,
                        html=html,
                        plain_text=plain_text,
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
                    logger.warning("Resume send failed for %s: %s", send_row.to_email, e)

                db2.commit()
                delay = 2.0 if body.send_via == "smtp" else 0.5
                time.sleep(delay)

            b.status = "completed"
            db2.commit()

        except Exception as e:
            logger.exception("Resume batch %s failed: %s", batch_id, e)
            try:
                b = db2.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
                if b:
                    b.status = "failed"
                    db2.commit()
            except Exception:
                pass
        finally:
            db2.close()

    t = threading.Thread(target=_resume_batch, daemon=True)
    t.start()

    return {"batch_id": batch_id, "status": "resuming", "queued": queued_count}


@router.get("/batches")
def list_batches(
    search: Optional[str] = None,
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """List recent email batches (newest first). Optional search by campaign_key or subject."""
    query = db.query(EmailBatch)
    if search:
        query = query.filter(
            EmailBatch.campaign_key.ilike(f"%{search}%")
            | EmailBatch.subject.ilike(f"%{search}%")
            | EmailBatch.template_id.ilike(f"%{search}%")
        )
    batches = (
        query
        .order_by(EmailBatch.created_at.desc())
        .limit(50)
        .all()
    )

    # Aggregate status counts in a single query instead of N+1
    from sqlalchemy import func

    batch_ids = [b.id for b in batches]
    counts_query = (
        db.query(
            EmailSend.batch_id,
            EmailSend.status,
            func.count(EmailSend.id),
        )
        .filter(EmailSend.batch_id.in_(batch_ids))
        .group_by(EmailSend.batch_id, EmailSend.status)
        .all()
    ) if batch_ids else []

    # Build {batch_id: {status: count}} map
    counts_map: dict[int, dict[str, int]] = {}
    for batch_id, send_status, cnt in counts_query:
        counts_map.setdefault(batch_id, {})[send_status] = cnt

    results = []
    for b in batches:
        status_counts = counts_map.get(b.id, {})

        # Auto-recover stuck batches: if no queued sends remain but status is still processing
        if b.status == "processing" and status_counts.get("queued", 0) == 0 and status_counts:
            b.status = "completed"
            b.sent = sum(c for s, c in status_counts.items() if s not in ("failed", "queued"))
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


@router.post("/campaign")
def send_campaign_endpoint(
    body: CampaignRequest,
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Send a campaign to a user segment. Creates a tracked batch."""
    if body.target not in ("all", "free", "paid", "leads"):
        raise HTTPException(status_code=400, detail="target must be all, free, paid, or leads")

    campaign_type = body.template_id

    # Upgrade nudge uses per-user real usage data — keep old path for now
    if campaign_type == "upgrade_nudge":
        result = _send_upgrade_nudge_campaign(db, body.target, body.dry_run)
        return CampaignResponse(
            sent=result.get("sent", 0),
            skipped=result.get("skipped", 0),
            errors=result.get("errors", []),
            recipients=result.get("recipients", []),
        )

    # Get recipients. The "leads" segment is for cold-converting signed-up
    # users who never used the founder code, so opt-in is not required there.
    recipients = _get_marketing_recipients(
        db,
        body.target,
        exclude_apple_relay=body.skip_apple_relay,
        require_opt_in=body.target != "leads",
    )

    if body.dry_run:
        return CampaignResponse(
            sent=0,
            skipped=0,
            errors=[],
            recipients=[f"{u.name}, {u.email}" if u.name else u.email for u in recipients],
        )

    # Build campaign_key from template + target + date for dedup
    from datetime import date as date_type
    campaign_key = f"{campaign_type}-{body.target}-{date_type.today().isoformat()}"

    # Resolve subject
    meta = next((t for t in TEMPLATES if t["id"] == campaign_type), None)
    subject_map = {
        "scene_partner_launch": "New: rehearse lines with a scene partner that never flakes",
    }
    subject = subject_map.get(campaign_type, meta["subject"] if meta else "News from ActorRise")

    # Create batch record
    batch = EmailBatch(
        template_id=campaign_type,
        campaign_key=campaign_key,
        subject=subject,
        status="pending",
        total=len(recipients),
        created_by=admin.id,
    )
    db.add(batch)
    db.flush()

    default_name = body.variables.get("user_name", "there")
    skipped_dupes = 0
    skipped_dnc = 0
    dnc_emails = _get_dnc_emails(db)

    for user in recipients:
        email_addr = user.email.strip().lower()

        # Skip do-not-contact entries (includes paid users, apple relay, etc)
        if email_addr in dnc_emails:
            skipped_dnc += 1
            continue

        # Cross-batch dedup on campaign_key
        existing = (
            db.query(EmailSend)
            .join(EmailBatch)
            .filter(
                EmailSend.to_email == email_addr,
                EmailBatch.campaign_key == campaign_key,
                EmailSend.status.notin_(["failed"]),
            )
            .first()
        )
        if existing:
            skipped_dupes += 1
            continue

        send = EmailSend(
            batch_id=batch.id,
            to_email=email_addr,
            to_name=user.name or default_name,
            status="queued",
        )
        db.add(send)

    total_skipped = skipped_dupes + skipped_dnc
    batch.skipped = total_skipped
    batch.total = batch.total - total_skipped
    if skipped_dnc > 0:
        notes = list(batch.errors_json or [])
        notes.append(f"{skipped_dnc} do-not-contact entr{'y' if skipped_dnc == 1 else 'ies'} skipped")
        batch.errors_json = notes
    db.commit()

    batch_id = batch.id
    template_id = campaign_type
    variables = dict(body.variables)

    # Process in background thread
    def _process_campaign():
        db2 = SessionLocal()
        try:
            b = db2.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
            if not b:
                return
            b.status = "processing"
            db2.commit()

            client = _get_email_client(body.send_via)
            templates_svc = EmailTemplates()

            sends = db2.query(EmailSend).filter(
                EmailSend.batch_id == batch_id,
                EmailSend.status == "queued",
            ).all()

            render_map = {
                "custom": templates_svc.render_custom,
                "founder_offer": templates_svc.render_founder_offer,
                "founder_followup": templates_svc.render_founder_followup,
                "weekly_engagement": templates_svc.render_weekly_engagement,
            }
            # All marketing templates send as plain text for better inbox placement
            plain_text_map = {
                "custom": templates_svc.render_custom_plain,
                "welcome": templates_svc.render_welcome_plain,
                "founder_offer": templates_svc.render_founder_offer_plain,
                "founder_followup": templates_svc.render_founder_followup_plain,
                "weekly_engagement": templates_svc.render_weekly_engagement_plain,
            }
            render_fn = render_map.get(template_id)
            plain_fn = plain_text_map.get(template_id)
            if not render_fn:
                b.status = "failed"
                b.errors_json = [f"Unknown template: {template_id}"]
                db2.commit()
                return

            for send_row in sends:
                try:
                    vars_copy = dict(variables)
                    vars_copy["unsubscribe_url"] = build_unsubscribe_url(send_row.to_email)
                    vars_copy["user_name"] = send_row.to_name or default_name

                    html = render_fn(**vars_copy)
                    plain_text = plain_fn(**vars_copy) if plain_fn else None

                    # Inject self-hosted open/click tracking
                    html, plain_text = add_tracking(send_row.id, html=html, plain_text=plain_text)

                    response = client.send_email(
                        to=send_row.to_email,
                        subject=subject,
                        html=html,
                        plain_text=plain_text,
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
                    logger.warning("Campaign send failed for %s: %s", send_row.to_email, e)

                db2.commit()
                # SMTP needs more spacing to avoid Gmail throttling
                delay = 2.0 if body.send_via == "smtp" else 0.5
                time.sleep(delay)

            b.status = "completed"
            db2.commit()

            if b.sent > 0:
                audit = AdminAuditLog(
                    actor_admin_id=b.created_by,
                    target_user_id=b.created_by,
                    action_type="campaign_sent",
                    after_json={
                        "template": template_id,
                        "target": body.target,
                        "sent": b.sent,
                        "total": b.total,
                        "campaign_key": campaign_key,
                    },
                )
                db2.add(audit)
                db2.commit()

        except Exception as e:
            logger.exception("Campaign batch %s failed: %s", batch_id, e)
            try:
                b = db2.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
                if b:
                    b.status = "failed"
                    db2.commit()
            except Exception:
                pass
        finally:
            db2.close()

    t = threading.Thread(target=_process_campaign, daemon=True)
    t.start()

    return {"batch_id": batch_id, "status": "pending", "total": batch.total}


# ========================================
# Do-not-contact endpoints
# ========================================

def _serialize_dnc(row: EmailDoNotContact) -> dict[str, Any]:
    return {
        "id": row.id,
        "email": row.email,
        "name": row.name,
        "reason": row.reason,
        "added_at": row.added_at.isoformat() if row.added_at else None,
    }


@router.get("/do-not-contact")
def list_do_not_contact(
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """List every email on the do-not-contact list, newest first."""
    rows = (
        db.query(EmailDoNotContact)
        .order_by(EmailDoNotContact.added_at.desc())
        .all()
    )
    return [_serialize_dnc(r) for r in rows]


@router.post("/do-not-contact")
def add_do_not_contact(
    body: DncBulkAddRequest,
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Add one or more emails to the do-not-contact list. Idempotent."""
    if not body.entries:
        raise HTTPException(status_code=400, detail="No entries provided")

    added = 0
    skipped = 0
    for entry in body.entries:
        email_addr = (entry.email or "").strip().lower()
        if not email_addr:
            continue
        existing = (
            db.query(EmailDoNotContact)
            .filter(EmailDoNotContact.email == email_addr)
            .first()
        )
        if existing:
            skipped += 1
            continue
        db.add(
            EmailDoNotContact(
                email=email_addr,
                name=(entry.name or "").strip() or None,
                reason=(entry.reason or "").strip() or None,
                added_by=admin.id,
            )
        )
        added += 1
    db.commit()
    return {"added": added, "skipped": skipped}


@router.delete("/do-not-contact/{entry_id}")
def remove_do_not_contact(
    entry_id: int,
    _admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Remove a single entry from the do-not-contact list by ID."""
    row = db.query(EmailDoNotContact).filter(EmailDoNotContact.id == entry_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/do-not-contact/auto-apple-relay")
def auto_dnc_apple_relay(
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Bulk-add every Apple Hide-My-Email user to the do-not-contact list."""
    relay_users = (
        db.query(User)
        .filter(User.email.ilike(f"%{APPLE_RELAY_DOMAIN}%"))
        .all()
    )
    existing = {
        row[0]
        for row in db.query(EmailDoNotContact.email)
        .filter(EmailDoNotContact.email.ilike(f"%{APPLE_RELAY_DOMAIN}%"))
        .all()
    }
    added = 0
    for u in relay_users:
        addr = (u.email or "").strip().lower()
        if not addr or addr in existing:
            continue
        db.add(
            EmailDoNotContact(
                email=addr,
                name=u.name,
                reason="apple_sso_relay",
                added_by=admin.id,
            )
        )
        existing.add(addr)
        added += 1
    db.commit()
    return {"added": added, "scanned": len(relay_users)}




# ========================================
# Weekly Digest Batch System
# ========================================

class WeeklyDigestPrepareRequest(BaseModel):
    curated_monologue_id: Optional[int] = None  # Fallback for users without search history
    dry_run: bool = False


class WeeklyDigestRecipient(BaseModel):
    user_id: int
    email: str
    name: str
    monologue_id: int
    monologue_title: str
    monologue_character: str
    monologue_play: str
    monologue_snippet: str
    monologue_url: str
    character_analysis: str
    is_personalized: bool  # True if based on search history, False if curated fallback


class WeeklyDigestBatchResponse(BaseModel):
    batch_id: int
    status: str
    recipient_count: int
    personalized_count: int
    fallback_count: int
    sample_recipients: list[WeeklyDigestRecipient]
    estimated_cost: str  # e.g., "$0.12 (AI generation)"


@router.post("/weekly-digest/prepare")
def prepare_weekly_digest(
    body: WeeklyDigestPrepareRequest,
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """
    Prepare a weekly digest batch:
    1. Query free users not in DNC
    2. For each user with search history → pick personalized monologue via semantic search
    3. For users without history → use curated "Monologue of the Week"
    4. Generate AI character analysis for each unique monologue
    5. Save batch as "pending_approval"
    """
    from app.models.actor import Monologue, Play
    from app.models.search_log import SearchLog
    from app.services.ai.content_analyzer import ContentAnalyzer

    # Get free users not in DNC
    dnc_emails = _get_dnc_emails(db)

    free_users = (
        db.query(User)
        .outerjoin(UserSubscription)
        .filter(
            (UserSubscription.id == None) |  # No subscription
            (UserSubscription.status.notin_(["active", "trialing"]))  # Inactive sub
        )
        .all()
    )

    eligible_users = [
        u for u in free_users
        if u.email and u.email.strip().lower() not in dnc_emails
        and not is_apple_relay_email(u.email)
    ]

    if body.dry_run:
        return {
            "dry_run": True,
            "eligible_count": len(eligible_users),
            "sample_users": [
                {"email": u.email, "name": u.name}
                for u in eligible_users[:5]
            ],
        }

    # Get curated fallback monologue
    curated_monologue = None
    if body.curated_monologue_id:
        curated_monologue = (
            db.query(Monologue)
            .options(joinedload(Monologue.play))
            .filter(Monologue.id == body.curated_monologue_id)
            .first()
        )

    if not curated_monologue:
        # Pick a popular monologue as default
        curated_monologue = (
            db.query(Monologue)
            .options(joinedload(Monologue.play))
            .filter(Monologue.is_public == True)
            .order_by(Monologue.view_count.desc().nullslast())
            .first()
        )

    if not curated_monologue:
        raise HTTPException(status_code=400, detail="No monologues available for weekly digest")

    # Create batch
    from datetime import date as date_type
    campaign_key = f"weekly-digest-{date_type.today().isoformat()}"

    batch = EmailBatch(
        template_id="weekly_engagement",
        campaign_key=campaign_key,
        subject="This week's pick",
        status="pending_approval",
        total=len(eligible_users),
        created_by=admin.id,
    )
    db.add(batch)
    db.flush()

    # Build recipient list with monologue assignments
    analyzer = ContentAnalyzer()
    recipients_data: list[dict] = []
    analysis_cache: dict[int, str] = {}  # monologue_id -> character_analysis
    personalized_count = 0
    fallback_count = 0

    for user in eligible_users:
        # Check if user has search history
        last_search = (
            db.query(SearchLog)
            .filter(SearchLog.user_id == user.id)
            .order_by(SearchLog.created_at.desc())
            .first()
        )

        monologue = None
        is_personalized = False

        if last_search and last_search.query:
            # Try to find a personalized monologue based on their search
            # Use semantic search to find similar monologues
            from app.services.search.semantic_search import SemanticSearch
            try:
                searcher = SemanticSearch(db)
                results = searcher.search(last_search.query, limit=1)
                if results:
                    monologue = results[0]
                    is_personalized = True
                    personalized_count += 1
            except Exception as e:
                logger.warning(f"Semantic search failed for user {user.id}: {e}")

        if not monologue:
            monologue = curated_monologue
            fallback_count += 1

        # Generate character analysis (cached per monologue)
        if monologue.id not in analysis_cache:
            try:
                analysis = analyzer.generate_character_intro(
                    text=monologue.text,
                    character=monologue.character_name,
                    play_title=monologue.play.title if monologue.play else "Unknown",
                    author=monologue.play.author if monologue.play else "Unknown",
                )
                analysis_cache[monologue.id] = analysis
            except Exception as e:
                logger.warning(f"Failed to generate analysis for monologue {monologue.id}: {e}")
                analysis_cache[monologue.id] = f"A compelling moment for {monologue.character_name}."

        # Create EmailSend record with extra data in JSON
        snippet = (monologue.text[:200] + "...") if len(monologue.text) > 200 else monologue.text
        monologue_url = f"https://actorrise.com/monologues/{monologue.id}"

        send = EmailSend(
            batch_id=batch.id,
            to_email=user.email.strip().lower(),
            to_name=user.name or "there",
            status="queued",
        )
        db.add(send)

        recipients_data.append({
            "user_id": user.id,
            "email": user.email,
            "name": user.name or "there",
            "monologue_id": monologue.id,
            "monologue_title": monologue.title,
            "monologue_character": monologue.character_name,
            "monologue_play": monologue.play.title if monologue.play else "Unknown",
            "monologue_snippet": snippet,
            "monologue_url": monologue_url,
            "character_analysis": analysis_cache[monologue.id],
            "is_personalized": is_personalized,
        })

    # Store recipient data in batch metadata for later sending
    batch.errors_json = {
        "recipients_data": recipients_data,
        "curated_monologue_id": curated_monologue.id if curated_monologue else None,
    }
    db.commit()

    # Return sample recipients for preview
    sample = recipients_data[:5]
    estimated_cost = f"${len(analysis_cache) * 0.002:.2f} (AI generation for {len(analysis_cache)} unique monologues)"

    return {
        "batch_id": batch.id,
        "status": "pending_approval",
        "recipient_count": len(recipients_data),
        "personalized_count": personalized_count,
        "fallback_count": fallback_count,
        "sample_recipients": sample,
        "estimated_cost": estimated_cost,
    }


@router.get("/weekly-digest/{batch_id}")
def get_weekly_digest_batch(
    batch_id: int,
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """Get details of a weekly digest batch for review."""
    batch = db.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.template_id != "weekly_engagement":
        raise HTTPException(status_code=400, detail="Not a weekly digest batch")

    metadata = batch.errors_json or {}
    recipients_data = metadata.get("recipients_data", [])

    return {
        "batch_id": batch.id,
        "status": batch.status,
        "recipient_count": len(recipients_data),
        "personalized_count": sum(1 for r in recipients_data if r.get("is_personalized")),
        "fallback_count": sum(1 for r in recipients_data if not r.get("is_personalized")),
        "sample_recipients": recipients_data[:10],
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
    }


@router.post("/weekly-digest/{batch_id}/approve")
def approve_weekly_digest(
    batch_id: int,
    admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Approve and send a weekly digest batch."""
    batch = db.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.status != "pending_approval":
        raise HTTPException(status_code=400, detail=f"Batch status is '{batch.status}', expected 'pending_approval'")

    metadata = batch.errors_json or {}
    recipients_data = metadata.get("recipients_data", [])

    if not recipients_data:
        raise HTTPException(status_code=400, detail="No recipients in batch")

    # Clear metadata from errors_json (we'll use it for actual errors now)
    batch.errors_json = []
    batch.status = "pending"
    db.commit()

    batch_id_local = batch.id

    # Process in background
    def _send_weekly_digest():
        db2 = SessionLocal()
        try:
            b = db2.query(EmailBatch).filter(EmailBatch.id == batch_id_local).first()
            if not b:
                return
            b.status = "processing"
            db2.commit()

            client = _get_email_client("smtp")
            templates_svc = EmailTemplates()

            sends = db2.query(EmailSend).filter(
                EmailSend.batch_id == batch_id_local,
                EmailSend.status == "queued",
            ).all()

            # Build email -> recipient data map
            recipient_map = {r["email"].strip().lower(): r for r in recipients_data}

            for send_row in sends:
                try:
                    recipient = recipient_map.get(send_row.to_email)
                    if not recipient:
                        send_row.status = "failed"
                        b.skipped += 1
                        continue

                    vars_copy = {
                        "user_name": recipient["name"],
                        "character_analysis": recipient["character_analysis"],
                        "monologue_snippet": recipient["monologue_snippet"],
                        "monologue_url": recipient["monologue_url"],
                        "unsubscribe_url": build_unsubscribe_url(send_row.to_email),
                    }

                    html = templates_svc.render_weekly_engagement(**vars_copy)
                    plain_text = templates_svc.render_weekly_engagement_plain(**vars_copy)

                    html, plain_text = add_tracking(send_row.id, html=html, plain_text=plain_text)

                    response = client.send_email(
                        to=send_row.to_email,
                        subject="This week's pick",
                        html=html,
                        plain_text=plain_text,
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
                    logger.warning("Weekly digest send failed for %s: %s", send_row.to_email, e)

                db2.commit()
                time.sleep(2.0)  # SMTP throttling

            b.status = "completed"
            db2.commit()

            if b.sent > 0:
                audit = AdminAuditLog(
                    actor_admin_id=b.created_by,
                    target_user_id=b.created_by,
                    action_type="weekly_digest_sent",
                    after_json={
                        "template": "weekly_engagement",
                        "sent": b.sent,
                        "total": b.total,
                        "campaign_key": b.campaign_key,
                    },
                )
                db2.add(audit)
                db2.commit()

        except Exception as e:
            logger.exception("Weekly digest batch %s failed: %s", batch_id_local, e)
            try:
                b = db2.query(EmailBatch).filter(EmailBatch.id == batch_id_local).first()
                if b:
                    b.status = "failed"
                    db2.commit()
            except Exception:
                pass
        finally:
            db2.close()

    t = threading.Thread(target=_send_weekly_digest, daemon=True)
    t.start()

    return {"batch_id": batch_id, "status": "processing", "message": "Weekly digest send started"}


@router.delete("/weekly-digest/{batch_id}")
def cancel_weekly_digest(
    batch_id: int,
    _admin: User = Depends(require_approval_permission),
    db: Session = Depends(get_db),
):
    """Cancel a pending weekly digest batch."""
    batch = db.query(EmailBatch).filter(EmailBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.status not in ("pending_approval", "pending"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel batch with status '{batch.status}'")

    # Delete all queued sends
    db.query(EmailSend).filter(
        EmailSend.batch_id == batch_id,
        EmailSend.status == "queued",
    ).delete()

    batch.status = "cancelled"
    db.commit()

    return {"ok": True, "message": "Weekly digest batch cancelled"}


# ========================================
# Leads browser
# ========================================

@router.get("/leads")
def list_leads(
    _user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """
    Return signed-up users with reachability + status flags so the admin
    UI can browse, filter, and select cold-outreach targets.

    Returns up to 1000 users (newest first). The frontend filters in-memory
    so chip toggles are instant.
    """
    users = (
        db.query(User)
        .options(joinedload(User.subscription).joinedload(UserSubscription.tier))
        .order_by(User.created_at.desc())
        .limit(1000)
        .all()
    )

    dnc_emails = _get_dnc_emails(db)

    out: list[dict[str, Any]] = []
    for u in users:
        sub = u.subscription
        tier = sub.tier if sub else None
        tier_name = tier.name if tier else None
        sub_status = sub.status if sub else None
        is_active_paid = (
            sub is not None
            and sub.status in ("active", "trialing")
            and tier_name is not None
            and tier_name != "free"
        )
        addr = (u.email or "").strip().lower()
        out.append(
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "tier_name": tier_name,
                "subscription_status": sub_status,
                "is_active_paid": is_active_paid,
                "is_apple_relay": is_apple_relay_email(u.email),
                "on_dnc": addr in dnc_emails,
                "marketing_opt_in": bool(u.marketing_opt_in),
                "total_scripts_uploaded": int(u.total_scripts_uploaded or 0),
            }
        )
    return out
