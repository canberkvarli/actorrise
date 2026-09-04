"""Guards for the email rendering path.

There were no tests here, which is how every outbound email stayed broken from
2026-08-19 to 2026-09-05: EmailTemplates.__init__ calls self._palette(), and a
signature change made that raise at construction. Nothing sent for 17 days and
nothing failed loudly. These tests are cheap and cover that whole class of bug.
"""

import pytest

from app.api.admin.emails import (
    PLAIN_TEXT_MAP,
    RENDER_MAP,
    TEMPLATES,
    _render_template,
)
from app.services.email.templates import EmailTemplates

# The variables the admin composer actually posts for a custom send.
CUSTOM_VARS = {
    "user_name": "there",
    "subject": "a thank you, no pitch",
    "preheader": "",
    "body_markdown": "ActorRise passed **800 actors**.\n\nJust hit [reply](https://actorrise.com).",
    "sender_name": "Canberk",
    "sender_title": "Founder, ActorRise",
    "postscript": "reply UNSUBSCRIBE and I'll take you off the list.",
    "cta_label": "",
    "cta_url": "",
}


def test_every_mapped_renderer_exists():
    """The bulk send paths resolve renderers from these maps by name.

    Preview would catch a broken renderer; a queued campaign would not, it just
    fails mid-batch. Cheaper to assert the maps are honest.
    """
    templates = EmailTemplates()
    for name in {**RENDER_MAP, **PLAIN_TEXT_MAP}.values():
        assert getattr(templates, name, None), f"EmailTemplates has no {name}"


def test_every_offered_template_has_a_renderer():
    """A template in the admin dropdown with no entry in RENDER_MAP fails as
    'Unknown template' only once a send is already queued."""
    assert {t["id"] for t in TEMPLATES} - set(RENDER_MAP) == set()


def test_constructing_email_templates_does_not_raise():
    """__init__ builds the default palette, so construction alone catches a lot."""
    EmailTemplates()


@pytest.mark.parametrize("template_id", [t["id"] for t in TEMPLATES])
@pytest.mark.parametrize("theme", ["auto", "dark"])
def test_every_admin_template_renders(template_id, theme):
    """Each template the admin UI offers must render in both themes.

    This also covers the renderer lookup: the maps in _render_template used to
    resolve bound methods eagerly, so one missing method broke every template.
    """
    html, subject, _plain = _render_template(template_id, {**CUSTOM_VARS, "theme": theme})
    assert html.strip(), f"{template_id}/{theme} rendered empty HTML"
    assert subject, f"{template_id}/{theme} rendered no subject"


def test_custom_theme_actually_changes_the_html():
    """theme=dark must force the dark palette inline, not silently no-op.

    Regressed once when _palette gained a `self` parameter while staying a
    staticmethod, so the theme argument was swallowed and every email rendered
    light.
    """
    dark, _, _ = _render_template("custom", {**CUSTOM_VARS, "theme": "dark"})
    auto, _, _ = _render_template("custom", {**CUSTOM_VARS, "theme": "auto"})

    assert dark != auto, "theme=dark produced identical HTML to theme=auto"
    assert EmailTemplates._palette("dark")["bg"] == "#121212"
    assert EmailTemplates._palette("auto")["bg"] == "#ffffff"


def test_custom_renders_markdown_and_postscript():
    """render_custom leans on the _markdown_to_* helpers, which were deleted once."""
    html, _, plain = _render_template("custom", {**CUSTOM_VARS, "theme": "auto"})

    assert "<strong>800 actors</strong>" in html
    assert "https://actorrise.com" in html
    assert "UNSUBSCRIBE" in html
    assert plain is not None, "custom must ship a plain-text part for inbox placement"
    assert "<" not in plain, "plain-text part still contains markup"
