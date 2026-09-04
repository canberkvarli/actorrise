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
        # Default palette so every template that doesn't opt into a theme
        # (welcome, submission_*, upgrade_notification, ...) still renders.
        # render() kwargs override globals, which is how custom.html goes dark.
        self.env.globals["c"] = self._palette("auto")

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

    def render_membership_granted(
        self,
        user_name: str,
        tier_display_name: str = "Plus",
        duration_label: Optional[str] = None,
        account_type: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
    ) -> str:
        """Render the "I've put you on Plus" email for a comped account.

        `duration_label` is human copy ("1 month", "2 weeks"), or None for a
        permanent comp, which drops the expiry sentence entirely rather than
        printing an empty one. `account_type` picks which promise is made:
        an educator is told her class is covered, a student is pointed at their
        teacher, and everyone else gets neither.
        """
        template = self.env.get_template('membership_granted.html')
        return template.render(
            user_name=user_name or "there",
            tier_display_name=tier_display_name or "Plus",
            duration_label=duration_label,
            account_type=account_type,
            unsubscribe_url=unsubscribe_url,
        )

    def render_membership_granted_plain(
        self,
        user_name: str,
        tier_display_name: str = "Plus",
        duration_label: Optional[str] = None,
        account_type: Optional[str] = None,
        **kwargs,
    ) -> str:
        """Plain-text alternative. Same promises, same order, no markup."""
        name = user_name or "there"
        tier = tier_display_name or "Plus"
        free_for = f", free for {duration_label}" if duration_label else ", free"
        lines = [f"Hey {name},", ""]
        if account_type == "educator":
            lines += [
                f"Your account is on {tier}{free_for}. No card, nothing to cancel, "
                "and I won't ask you for one later.",
                "",
                "Same goes for your students. Send me their emails whenever you have "
                "the list, all at once or a few at a time, and I'll put them on the "
                "same dates so your whole class runs together instead of on thirty "
                "different clocks. My address is canberk@actorrise.com.",
            ]
        elif account_type == "student":
            lines += [
                f"Your account is on {tier}{free_for}. No card, nothing to cancel, "
                "and I won't ask you for one later.",
                "",
                "If your teacher wants the rest of the class on it, have them email "
                "me at canberk@actorrise.com and I'll set everyone up at once.",
            ]
        else:
            for_x = f" for {duration_label}" if duration_label else ""
            lines += [
                f"I've put your account on {tier}{for_x}, on me. No card, nothing to "
                "cancel, and I won't ask you for one later.",
            ]
        lines += [
            "",
            "What that opens up:",
            "",
            "1. Upload your own sides and rehearse them with a partner that reads every other role",
            "2. The full monologue library, no limit on what you can read",
            "3. Save what you find so it's there next time",
            "",
            "Start wherever makes sense: actorrise.com/practice to bring in a script, "
            "or actorrise.com/monologues to go through the library.",
        ]
        if duration_label:
            lines += [
                "",
                f"When the {duration_label} is up the account just drops back to free. "
                "Nothing gets charged, nothing disappears. If you want longer, reply "
                "and say so and I'll push it out.",
            ]
        lines += [
            "",
            "If something's broken or confusing, reply to this and tell me. It's just "
            "me back here, so it tends to get fixed the same week.",
            "",
            "Canberk",
            "Founder | Actor",
            "actorrise.com",
        ]
        return "\n".join(lines)

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

    def render_saved_piece_reminder(
        self,
        character: str,
        play: str,
        link: str,
        user_name: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
        **kwargs,
    ) -> str:
        """Day-1 nudge back to a monologue the actor saved but never worked."""
        template = self.env.get_template('saved_piece_reminder.html')
        return template.render(
            character=character,
            play=play,
            link=link,
            user_name=(user_name or "").split()[0] if user_name else None,
            preheader="it takes two minutes. cut it, or just say it out loud once.",
            unsubscribe_url=unsubscribe_url,
        )

    # ── Plain text renderers (for Gmail Primary tab placement) ──

    def render_saved_piece_reminder_plain(
        self,
        character: str,
        play: str,
        link: str,
        user_name: Optional[str] = None,
        **kwargs,
    ) -> str:
        name = (user_name or "").split()[0].lower() if user_name else ""
        greeting = f"hey {name}," if name else "hey,"
        return "\n".join([
            greeting,
            "",
            f"you saved {character} from {play} a few days ago and never came "
            "back to it. i do that all the time, bookmark something and forget "
            "it exists.",
            "",
            f"here it is again: {link}",
            "",
            "give it two minutes. hit rehearse and run it out loud, or cut it "
            "down to audition size. that's the whole reason you saved it.",
            "",
            "canberk",
            "",
            "reply unsubscribe and i'll take you off, no worries.",
        ])

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

    # Restored after f1585d85: retiring the founder offer also deleted these
    # three, but render_custom, render_custom_plain and the weekly digest
    # still call them.
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

    @staticmethod
    def _palette(theme: Optional[str] = None) -> dict:
        """Colours for one email.

        theme="dark"  -> forced dark for every reader, inlined so it survives
                         Outlook and Gmail's stripping of <style> blocks.
        theme="auto"  -> light, but flips via prefers-color-scheme for readers
                         whose client is in dark mode. This is the default and
                         the right choice for personal-feeling letters.
        """
        dark = (theme or "auto").strip().lower() == "dark"
        if dark:
            return {
                "auto": False, "bg": "#121212", "fg": "#ededed",
                "muted": "#8f8f8f", "sig": "#b0b0b0", "rule": "#2c2c2c",
                "link": "#FF7A33", "btn_bg": "#FF7A33", "btn_fg": "#1a1a1a",
            }
        return {
            "auto": True, "bg": "#ffffff", "fg": "#1a1a1a",
            "muted": "#999999", "sig": "#555555", "rule": "#eeeeee",
            "link": "#CB4B00", "btn_bg": "#CB4B00", "btn_fg": "#ffffff",
        }

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
            cta_url=kwargs.get("cta_url", ""),
            cta_label=kwargs.get("cta_label", ""),
            preheader=kwargs.get("preheader", ""),
            postscript=kwargs.get("postscript", ""),
            c=self._palette(kwargs.get("theme")),
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
        # Surface the CTA as a labeled link in plain text.
        cta_url = kwargs.get("cta_url", "")
        if cta_url:
            cta_label = kwargs.get("cta_label") or "Open"
            lines += ["", f"{cta_label}: {cta_url}"]
        # Only add signature if sender_title is provided
        if sender_title:
            lines += ["", sender_name, sender_title]
        postscript = kwargs.get("postscript")
        if postscript:
            lines += ["", postscript]
        unsubscribe_url = kwargs.get("unsubscribe_url")
        if unsubscribe_url:
            lines += [
                "",
                "---",
                "didn't mean to sign up for these? undo it here and i'll stop, "
                "no hard feelings:",
                unsubscribe_url,
            ]
        return "\n".join(lines)
