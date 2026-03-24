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
        share_url: Optional[str] = None,
        unsubscribe_url: Optional[str] = None,
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
            share_url=share_url or "https://actorrise.com",
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
        """Render ScenePartner launch email."""
        template = self.env.get_template('scene_partner_launch.html')
        return template.render(
            user_name=user_name or "there",
            video_url=video_url,
            unsubscribe_url=unsubscribe_url,
        )

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
