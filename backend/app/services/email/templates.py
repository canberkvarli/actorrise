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

    def render_upgrade_nudge(
        self,
        user_name: str,
        searches_used: int,
        searches_limit: int,
        unsubscribe_url: Optional[str] = None,
    ) -> str:
        """Render upgrade nudge email for free-tier users."""
        template = self.env.get_template('upgrade_nudge.html')
        return template.render(
            user_name=user_name or "there",
            searches_used=searches_used,
            searches_limit=searches_limit,
            unsubscribe_url=unsubscribe_url,
        )

    def render_feature_announcement(
        self,
        user_name: str,
        feature_title: str,
        feature_description: str,
        cta_text: str,
        cta_url: str,
        video_url: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
    ) -> str:
        """Render feature announcement email."""
        template = self.env.get_template('feature_announcement.html')
        return template.render(
            user_name=user_name or "there",
            feature_title=feature_title,
            feature_description=feature_description,
            cta_text=cta_text,
            cta_url=cta_url,
            video_url=video_url,
            unsubscribe_url=unsubscribe_url,
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

    def render_actor_page(
        self,
        user_name: str,
        intro_text: str = "I'm building actor pages on ActorRise where you can showcase your work, link your socials, and let people reach out to you directly. I'd love to set yours up.",
        step_1: str = "Sign up or log in at actorrise.com",
        step_2: str = "Go to your profile and fill in your bio, headshot, and links",
        step_3: str = "Your page goes live and anyone can find you",
        page_url: Optional[str] = None,
        cta_text: str = "Check out your page",
        extra_text: Optional[str] = None,
        sender_name: str = "Canberk",
        sender_title: str = "Founder | Actor, ActorRise",
        unsubscribe_url: Optional[str] = None,
    ) -> str:
        """Render actor page email."""
        template = self.env.get_template('actor_page.html')
        return template.render(
            user_name=user_name or "there",
            intro_text=intro_text,
            step_1=step_1,
            step_2=step_2,
            step_3=step_3,
            page_url=page_url,
            cta_text=cta_text,
            extra_text=extra_text,
            sender_name=sender_name,
            sender_title=sender_title,
            unsubscribe_url=unsubscribe_url,
        )

    def render_scene_partner_launch(
        self,
        user_name: str,
        video_url: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
        **kwargs,
    ) -> str:
        """Render ScenePartner launch email (HTML version for preview)."""
        template = self.env.get_template('scene_partner_launch.html')
        return template.render(
            user_name=user_name or "there",
            video_url=video_url,
            unsubscribe_url=unsubscribe_url,
        )

    def render_scene_partner_launch_plain(
        self,
        user_name: str,
        video_url: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
        **kwargs,
    ) -> str:
        """Render ScenePartner launch as plain text (lands in Gmail Primary)."""
        name = user_name or "there"
        lines = [
            f"Hey {name},",
            "",
            "Just finished building something I think you'll actually use. It's called ScenePartner.",
            "",
            "Basically, you upload a script (or pick one from the library), choose your character, and the AI reads the other parts with you. You can run it over and over. It listens to you and responds in real time.",
            "",
            "I built it because I got tired of asking friends to read with me at weird hours. Now I just open it and go.",
            "",
            "Let me know what you think. Seriously, just reply to this.",
            "",
            "Canberk",
            "Founder | Actor",
            "actorrise.com",
        ]
        return "\n".join(lines)

    def render_cold_outreach(
        self,
        user_name: str,
        intro_text: str = "I found your profile on Backstage and really liked your work. I'm building a platform called ActorRise where actors can find and rehearse monologues, get a personal profile page, and connect with other actors. I think you'd be a great fit.",
        body_text: Optional[str] = None,
        cta_text: Optional[str] = "Check it out",
        cta_url: Optional[str] = "https://actorrise.com",
        closing_text: Optional[str] = None,
        sender_name: str = "Canberk",
        sender_title: str = "Founder | Actor, ActorRise",
        unsubscribe_url: Optional[str] = None,
    ) -> str:
        """Render cold outreach email for recruiting actors."""
        template = self.env.get_template('cold_outreach.html')
        return template.render(
            user_name=user_name or "there",
            intro_text=intro_text,
            body_text=body_text,
            cta_text=cta_text,
            cta_url=cta_url,
            closing_text=closing_text,
            sender_name=sender_name,
            sender_title=sender_title,
            unsubscribe_url=unsubscribe_url,
        )

    def render_weekly_engagement(
        self,
        user_name: str,
        monologue_title: Optional[str] = None,
        monologue_snippet: Optional[str] = None,
        monologue_url: Optional[str] = None,
        tip_title: Optional[str] = None,
        tip_body: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
    ) -> str:
        """Render weekly engagement digest email."""
        template = self.env.get_template('weekly_engagement.html')
        return template.render(
            user_name=user_name or "there",
            monologue_title=monologue_title,
            monologue_snippet=monologue_snippet,
            monologue_url=monologue_url or "https://actorrise.com/dashboard",
            tip_title=tip_title,
            tip_body=tip_body,
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
            "Founder | Actor",
            "actorrise.com",
        ])

    def render_upgrade_nudge_plain(self, user_name: str, searches_used: int = 8, searches_limit: int = 10, **kwargs) -> str:
        name = user_name or "there"
        return "\n".join([
            f"Hey {name},",
            "",
            f"You've used {searches_used} of your {searches_limit} AI searches this month. That tells me you're finding value in ActorRise, which is awesome.",
            "",
            "With Plus you get 150 searches/month, unlimited saved monologues, 30 ScenePartner sessions, and PDF downloads. It's $12/mo or $99/year (2 months free).",
            "",
            "If you want to upgrade: actorrise.com/pricing",
            "",
            "No pressure at all. Just wanted to let you know before you hit the limit. If you have any questions, just reply to this.",
            "",
            "Canberk",
            "Founder | Actor",
            "actorrise.com",
        ])

    def render_feature_announcement_plain(self, user_name: str, feature_title: str = "", feature_description: str = "", **kwargs) -> str:
        name = user_name or "there"
        return "\n".join([
            f"Hey {name},",
            "",
            feature_description,
            "",
            "If you have feedback or questions, just reply to this email.",
            "",
            "Canberk",
            "Founder | Actor",
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
            sender_title,
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
            <p>{sender_name}<br>actorrise.com</p>
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
            "actorrise.com",
        ]
        return "\n".join(lines)

    def render_actor_page_plain(self, user_name: str, intro_text: str = "", step_1: str = "", step_2: str = "", step_3: str = "", sender_name: str = "Canberk", sender_title: str = "Founder | Actor, ActorRise", **kwargs) -> str:
        name = user_name or "there"
        return "\n".join([
            f"Hey {name},",
            "",
            intro_text,
            "",
            "Here's how to set it up:",
            "",
            f"1. {step_1}",
            f"2. {step_2}",
            f"3. {step_3}",
            "",
            "If you have any questions, just reply to this email.",
            "",
            sender_name,
            sender_title,
        ])

    def render_cold_outreach_plain(self, user_name: str, intro_text: str = "", body_text: str = "", closing_text: str = "", sender_name: str = "Canberk", sender_title: str = "Founder | Actor, ActorRise", **kwargs) -> str:
        name = (user_name or "there").split()[0]
        lines = [
            f"Hey {name},",
            "",
            intro_text,
        ]
        if body_text:
            lines += ["", body_text]
        if closing_text:
            lines += ["", closing_text]
        lines += [
            "",
            "If you have any questions, just reply to this email.",
            "",
            sender_name,
            sender_title,
        ]
        return "\n".join(lines)

    def render_weekly_engagement_plain(self, user_name: str, monologue_title: str = "", monologue_snippet: str = "", tip_title: str = "", tip_body: str = "", **kwargs) -> str:
        name = user_name or "there"
        lines = [
            f"Hey {name},",
            "",
            "Here's what caught my eye this week.",
        ]
        if monologue_title:
            lines += ["", f"This week's pick: {monologue_title}"]
            if monologue_snippet:
                lines += ["", f'"{monologue_snippet}"']
        if tip_title:
            lines += ["", f"{tip_title}", tip_body]
        lines += [
            "",
            "If something caught your eye, just reply and let me know.",
            "",
            "Canberk",
            "Founder | Actor",
            "actorrise.com",
        ]
        return "\n".join(lines)
