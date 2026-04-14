"""
Email template rendering using Jinja2.

Provides HTML email templates for:
- Submission received
- Submission approved
- Submission rejected
- Manual review in progress
"""

from pathlib import Path
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape


class EmailTemplates:
    """
    Render email templates with Jinja2.

    Templates are stored in app/services/email/templates/
    """

    def __init__(self):
        """Initialize Jinja2 environment."""
        template_dir = Path(__file__).parent / "templates"
        self.env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=select_autoescape(['html', 'xml'])
        )

    def render_submission_received(
        self,
        user_name: str,
        monologue_title: str
    ) -> str:
        """
        Render submission received email.

        Args:
            user_name: User's name
            monologue_title: Title of submitted monologue

        Returns:
            HTML email content
        """
        template = self.env.get_template('submission_received.html')
        return template.render(
            user_name=user_name,
            monologue_title=monologue_title
        )

    def render_submission_approved(
        self,
        user_name: str,
        monologue_title: str,
        monologue_url: str
    ) -> str:
        """
        Render submission approved email.

        Args:
            user_name: User's name
            monologue_title: Title of submitted monologue
            monologue_url: URL to view approved monologue

        Returns:
            HTML email content
        """
        template = self.env.get_template('submission_approved.html')
        return template.render(
            user_name=user_name,
            monologue_title=monologue_title,
            monologue_url=monologue_url
        )

    def render_submission_rejected(
        self,
        user_name: str,
        monologue_title: str,
        reason: str,
        details: str
    ) -> str:
        """
        Render submission rejected email.

        Args:
            user_name: User's name
            monologue_title: Title of submitted monologue
            reason: Rejection reason category
            details: Detailed explanation

        Returns:
            HTML email content
        """
        template = self.env.get_template('submission_rejected.html')
        return template.render(
            user_name=user_name,
            monologue_title=monologue_title,
            reason=reason,
            details=details
        )

    def render_submission_under_review(
        self,
        user_name: str,
        monologue_title: str,
        estimated_review_time: str = "24-48 hours"
    ) -> str:
        """
        Render submission under review email.

        Args:
            user_name: User's name
            monologue_title: Title of submitted monologue
            estimated_review_time: Estimated review time

        Returns:
            HTML email content
        """
        template = self.env.get_template('submission_under_review.html')
        return template.render(
            user_name=user_name,
            monologue_title=monologue_title,
            estimated_review_time=estimated_review_time
        )

    def render_welcome(
        self,
        user_name: str,
        unsubscribe_url: Optional[str] = None,
    ) -> str:
        """Render welcome email for new signups."""
        template = self.env.get_template('welcome.html')
        return template.render(
            user_name=user_name or "there",
            unsubscribe_url=unsubscribe_url,
        )

    def render_upgrade_notification(
        self,
        user_name: str,
        user_email: str,
        tier_display_name: str,
        billing_period: str,
        timestamp: str,
    ) -> str:
        """Render upgrade notification email (sent to admin)."""
        template = self.env.get_template('upgrade_notification.html')
        return template.render(
            user_name=user_name,
            user_email=user_email,
            tier_display_name=tier_display_name,
            billing_period=billing_period,
            timestamp=timestamp,
        )

    def render_founder_offer(
        self,
        user_name: str,
        intro_text: str = "I wanted to reach out personally. I'm an actor too, and I built ActorRise because I couldn't find the tools I needed. You signed up early and that means a lot to me.",
        body_text: Optional[str] = None,
        promo_code: str = "FOUNDER",
        discount_description: str = "Enter this at checkout",
        upgrade_url: str = "https://actorrise.com/pricing",
        sender_name: str = "Canberk",
        sender_title: str = "Founder, ActorRise",
        share_text: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
        **kwargs,
    ) -> str:
        """Render founder offer email with promo code, testimony ask, and share CTA."""
        template = self.env.get_template('founder_offer.html')
        return template.render(
            user_name=user_name or "there",
            intro_text=intro_text,
            body_text=body_text,
            promo_code=promo_code,
            discount_description=discount_description,
            upgrade_url=upgrade_url,
            sender_name=sender_name,
            sender_title=sender_title,
            share_text=share_text,
            unsubscribe_url=unsubscribe_url,
        )

    def render_weekly_engagement(
        self,
        user_name: str,
        character_analysis: Optional[str] = None,
        monologue_snippet: Optional[str] = None,
        monologue_url: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
        **kwargs,  # Ignore old params for backwards compatibility
    ) -> str:
        """Render weekly engagement digest email."""
        template = self.env.get_template('weekly_engagement.html')
        return template.render(
            user_name=user_name or "there",
            character_analysis=character_analysis,
            monologue_snippet=monologue_snippet,
            monologue_url=monologue_url or "https://actorrise.com/dashboard",
            unsubscribe_url=unsubscribe_url,
        )

    # ── Plain text renderers (for Gmail Primary tab placement) ──

    def render_welcome_plain(self, user_name: str, **kwargs) -> str:
        name = user_name or "there"
        return "\n".join([
            f"Hey {name},",
            "",
            "Welcome to ActorRise. Really glad you signed up.",
            "",
            "Here's what you can do right now:",
            "",
            "1. Search 8,600+ monologues with AI (way faster than flipping through books)",
            "2. Upload scripts and rehearse scenes with an AI scene partner",
            "3. Build your actor profile page",
            "",
            "Head to actorrise.com/dashboard and start exploring.",
            "",
            "If you have feedback, questions, or ideas, just reply to this email. I read everything.",
            "",
            "Canberk",
            "Founder, ActorRise",
            "actorrise.com",
        ])

    def render_founder_offer_plain(self, user_name: str, intro_text: str = "", body_text: str = "", promo_code: str = "FOUNDER", upgrade_url: str = "actorrise.com/pricing", sender_name: str = "Canberk", sender_title: str = "Founder, ActorRise", **kwargs) -> str:
        name = (user_name or "there").split()[0]
        lines = [
            f"hey {name},",
            "",
            intro_text,
        ]
        if body_text:
            lines += ["", body_text]
        lines += [
            "",
            f"Your code: {promo_code}",
            f"Use it at checkout: {upgrade_url}",
            "",
            "Appreciate you being here. If you have any questions, just reply to this email.",
            "",
            sender_name,
            "Founder, ActorRise",
            "actorrise.com",
        ]
        return "\n".join(lines)

    def render_founder_followup(
        self,
        user_name: str,
        intro_text: str = "Just wanted to follow up on my last email. The founder code is still active if you want to use it.",
        promo_code: str = "FOUNDER",
        upgrade_url: str = "https://actorrise.com/pricing",
        sender_name: str = "Canberk",
        sender_title: str = "Founder, ActorRise",
        unsubscribe_url: Optional[str] = None,
        **kwargs,
    ) -> str:
        """Render founder follow-up email (HTML version for preview)."""
        # Simple HTML wrapper for preview - actual send uses plain text
        name = (user_name or "there").split()[0]
        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <p>hey {name},</p>
            <p>{intro_text}</p>
            <p>Your code is {promo_code}</p>
            <p>No pressure at all. Just didn't want it to get buried in your inbox.</p>
            <p>{sender_name}<br>Founder, ActorRise<br>actorrise.com</p>
        </div>
        """
        return html

    def render_founder_followup_plain(
        self,
        user_name: str,
        intro_text: str = "Just wanted to follow up on my last email. The founder code is still active if you want to use it.",
        promo_code: str = "FOUNDER",
        upgrade_url: str = "https://actorrise.com/pricing",
        sender_name: str = "Canberk",
        sender_title: str = "Founder, ActorRise",
        **kwargs,
    ) -> str:
        """Render founder follow-up as plain text."""
        name = (user_name or "there").split()[0]
        lines = [
            f"hey {name},",
            "",
            intro_text,
            "",
            f"Your code is {promo_code}",
            "",
            "No pressure at all. Just didn't want it to get buried in your inbox.",
            "",
            sender_name,
            "Founder, ActorRise",
            "actorrise.com",
        ]
        return "\n".join(lines)

    def render_weekly_engagement_plain(self, user_name: str, character_analysis: str = "", monologue_snippet: str = "", monologue_url: str = "", **kwargs) -> str:
        name = user_name or "there"
        lines = [
            f"Hey {name},",
            "",
        ]
        if character_analysis:
            lines += [character_analysis, ""]
        if monologue_snippet:
            lines += [f'"{monologue_snippet}"', ""]
        if monologue_url:
            lines += [f"Read the full monologue: {monologue_url}", ""]
        lines += [
            "",
            "Want to practice a scene? Try our sample script or upload your own and start rehearsing with AI Scene Partner.",
            "Try it: actorrise.com/dashboard",
            "",
            "I'd love your feedback on Scene Partner - just reply to this email. I read everything.",
            "",
            "Canberk",
            "Founder, ActorRise",
            "actorrise.com",
        ]
        return "\n".join(lines)

    # ── Custom template (freeform with Markdown) ──

    def _markdown_to_html(self, text: str) -> str:
        """Convert Markdown text to simple HTML paragraphs."""
        import re

        # Split into paragraphs
        paragraphs = text.strip().split("\n\n")
        html_parts = []

        for para in paragraphs:
            if not para.strip():
                continue

            # Convert single newlines to <br>
            para = para.replace("\n", "<br>")

            # Bold: **text** or __text__
            para = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', para)
            para = re.sub(r'__(.+?)__', r'<strong>\1</strong>', para)

            # Italic: *text* or _text_
            para = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', para)
            para = re.sub(r'_([^_]+)_', r'<em>\1</em>', para)

            # Links: [text](url)
            para = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', para)

            html_parts.append(f"<p>{para}</p>")

        return "\n".join(html_parts)

    def _markdown_to_plain(self, text: str) -> str:
        """Convert Markdown to plain text (strip formatting)."""
        import re

        # Remove bold markers
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
        text = re.sub(r'__(.+?)__', r'\1', text)

        # Remove italic markers
        text = re.sub(r'\*([^*]+)\*', r'\1', text)
        text = re.sub(r'_([^_]+)_', r'\1', text)

        # Convert links to "text (url)" format
        text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1 (\2)', text)

        return text

    def render_custom(
        self,
        user_name: str,
        body_markdown: str = "",
        sender_name: str = "Canberk",
        sender_title: str = "",
        unsubscribe_url: Optional[str] = None,
        **kwargs,
    ) -> str:
        """Render custom freeform email with Markdown support (HTML version for preview)."""
        template = self.env.get_template('custom.html')
        body_html = self._markdown_to_html(body_markdown) if body_markdown else ""
        return template.render(
            user_name=user_name or "there",
            body_html=body_html,
            sender_name=sender_name,
            sender_title=sender_title,
            unsubscribe_url=unsubscribe_url,
            subject=kwargs.get("subject", ""),
        )

    def render_custom_plain(
        self,
        user_name: str,
        body_markdown: str = "",
        sender_name: str = "Canberk",
        sender_title: str = "",
        **kwargs,
    ) -> str:
        """Render custom freeform email as plain text."""
        name = (user_name or "there").split()[0]
        body_plain = self._markdown_to_plain(body_markdown) if body_markdown else ""
        lines = [
            f"hey {name},",
            "",
            body_plain,
        ]
        # Only add signature if sender_title is provided
        if sender_title:
            lines += ["", sender_name, sender_title]
        return "\n".join(lines)
