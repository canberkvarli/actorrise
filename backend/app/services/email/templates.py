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
