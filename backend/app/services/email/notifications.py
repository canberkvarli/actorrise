"""
Helper functions for sending notification emails.

Integrates Resend client with email templates for
submission workflow and welcome emails.
"""

import os
from typing import Optional

from app.services.email.resend_client import ResendEmailClient
from app.services.email.templates import EmailTemplates


def send_welcome_email(user_email: str, user_name: Optional[str] = None) -> dict:
    """
    Send welcome email to new signups.

    Args:
        user_email: Recipient email
        user_name: User's display name (optional)

    Returns:
        Resend response dict, or mock if RESEND_API_KEY not set
    """
    if not os.getenv("RESEND_API_KEY"):
        print("Warning: RESEND_API_KEY not set. Welcome email disabled.")
        return {"id": "mock_welcome_id", "status": "disabled"}

    try:
        client = ResendEmailClient()
        templates = EmailTemplates()
        subject = "Welcome to ActorRise"
        html = templates.render_welcome(user_name=user_name or "there")
        return client.send_email(to=user_email, subject=subject, html=html)
    except Exception as e:
        print(f"Error sending welcome email to {user_email}: {e}")
        raise


def send_submission_notification(
    user_email: str,
    user_name: str,
    status: str,
    monologue_title: str,
    monologue_url: Optional[str] = None,
    rejection_reason: Optional[str] = None,
    rejection_details: Optional[str] = None,
    estimated_review_time: str = "24-48 hours"
) -> dict:
    """
    Send submission notification email based on status.

    Args:
        user_email: Recipient email
        user_name: User's name
        status: 'received', 'approved', 'rejected', 'under_review'
        monologue_title: Title of the monologue
        monologue_url: URL to view monologue (for approved submissions)
        rejection_reason: Reason category (for rejected submissions)
        rejection_details: Detailed explanation (for rejected submissions)
        estimated_review_time: Estimated review time (for under_review)

    Returns:
        Resend response dict

    Raises:
        ValueError: If RESEND_API_KEY not set or invalid status
        Exception: If email sending fails
    """
    # Check if Resend is configured
    if not os.getenv("RESEND_API_KEY"):
        print("Warning: RESEND_API_KEY not set. Email notifications are disabled.")
        return {'id': 'mock_email_id', 'status': 'disabled'}

    try:
        client = ResendEmailClient()
        templates = EmailTemplates()

        # Render template based on status
        if status == 'received':
            subject = f"Submission Received: {monologue_title}"
            html = templates.render_submission_received(
                user_name=user_name,
                monologue_title=monologue_title
            )

        elif status == 'approved':
            subject = f"🎉 Submission Approved: {monologue_title}"
            if not monologue_url:
                monologue_url = "https://actorrise.com/monologues"
            html = templates.render_submission_approved(
                user_name=user_name,
                monologue_title=monologue_title,
                monologue_url=monologue_url
            )

        elif status == 'rejected':
            subject = f"Submission Update: {monologue_title}"
            html = templates.render_submission_rejected(
                user_name=user_name,
                monologue_title=monologue_title,
                reason=rejection_reason or "Unknown",
                details=rejection_details or "No details provided."
            )

        elif status == 'under_review':
            subject = f"Submission Under Review: {monologue_title}"
            html = templates.render_submission_under_review(
                user_name=user_name,
                monologue_title=monologue_title,
                estimated_review_time=estimated_review_time
            )

        else:
            raise ValueError(f"Invalid status: {status}. Must be one of: received, approved, rejected, under_review")

        # Send email
        response = client.send_email(
            to=user_email,
            subject=subject,
            html=html
        )

        return response

    except Exception as e:
        print(f"Error sending {status} notification to {user_email}: {e}")
        raise


def send_upgrade_notification(
    user_name: str,
    user_email: str,
    tier_display_name: str,
    billing_period: str,
) -> dict:
    """
    Send upgrade notification to admin when a user upgrades to a paid tier.
    Fire-and-forget — never raises.
    """
    if not os.getenv("RESEND_API_KEY"):
        print("Warning: RESEND_API_KEY not set. Upgrade notification disabled.")
        return {"id": "mock_upgrade_id", "status": "disabled"}

    try:
        from datetime import datetime

        client = ResendEmailClient()
        templates = EmailTemplates()
        timestamp = datetime.now().strftime("%B %d, %Y at %I:%M %p UTC")
        subject = f"New upgrade: {user_name or user_email} -> {tier_display_name}"
        html = templates.render_upgrade_notification(
            user_name=user_name or "Unknown",
            user_email=user_email,
            tier_display_name=tier_display_name,
            billing_period=billing_period,
            timestamp=timestamp,
        )
        return client.send_email(
            to="canberk@actorrise.com",
            subject=subject,
            html=html,
        )
    except Exception as e:
        print(f"Error sending upgrade notification: {e}")
        return {"id": "error", "status": "failed"}
