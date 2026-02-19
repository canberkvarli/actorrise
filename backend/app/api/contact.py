"""
Public contact form API. Sends messages to canberkvarli@gmail.com via Resend.
No authentication required — for partnership, feedback, bugs, collaboration, etc.
"""

import html
import os

from app.services.email.resend_client import ResendEmailClient
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(prefix="/api/contact", tags=["contact"])

CONTACT_EMAIL = "canberkvarli@gmail.com"

CATEGORIES = [
    "partnership",
    "feedback",
    "bug",
    "collaboration",
    "support",
    "business_discount",
    "student_discount",
    "other",
]


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    category: str = Field(
        default="other",
        description="partnership, feedback, bug, collaboration, support, business_discount, student_discount, other",
    )
    message: str = Field(..., min_length=1, max_length=5000)


def _build_contact_html(name: str, email: str, category: str, message: str) -> str:
    safe_name = html.escape(name)
    safe_email = html.escape(email)
    category_label = html.escape(category.replace("_", " ").title())
    safe_message = html.escape(message)
    return f"""
    <div style="font-family: system-ui, sans-serif; max-width: 560px;">
        <h2 style="margin-top: 0;">New contact form message</h2>
        <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>From</strong></td><td style="padding: 6px 0; border-bottom: 1px solid #eee;">{safe_name}</td></tr>
            <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Email</strong></td><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><a href="mailto:{safe_email}">{safe_email}</a></td></tr>
            <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Category</strong></td><td style="padding: 6px 0; border-bottom: 1px solid #eee;">{category_label}</td></tr>
        </table>
        <h3 style="margin-bottom: 8px;">Message</h3>
        <div style="white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 8px;">{safe_message}</div>
        <p style="margin-top: 24px; color: #666; font-size: 12px;">Sent via ActorRise contact form.</p>
    </div>
    """


@router.post("")
def send_contact_message(body: ContactRequest) -> dict:
    """
    Send a contact form message to ActorRise. Delivered to canberkvarli@gmail.com via Resend.
    """
    if body.category not in CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(CATEGORIES)}",
        )

    if not os.getenv("RESEND_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="Contact form is temporarily unavailable. Please email canberkvarli@gmail.com directly.",
        )

    try:
        client = ResendEmailClient()
        subject = f"[ActorRise Contact] {body.category}: from {body.name}"
        html = _build_contact_html(
            name=body.name,
            email=body.email,
            category=body.category,
            message=body.message,
        )
        client.send_email(
            to=CONTACT_EMAIL,
            subject=subject,
            html=html,
        )
        return {"ok": True, "message": "Thanks! Your message was sent. I'll get back to you soon."}
    except Exception as e:
        print(f"Contact form send failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to send message. Please try again or email canberkvarli@gmail.com directly.",
        )
