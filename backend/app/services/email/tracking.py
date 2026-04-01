"""
Email tracking injection helpers.

Adds open-tracking pixel and click-tracking link wrapping
to emails before sending. Works with any email provider.
"""

import os
import re
from urllib.parse import quote, urlencode


def _get_base_url() -> str:
    """API base URL for tracking endpoints."""
    return os.getenv("API_URL", "https://api.actorrise.com")


def build_open_pixel(send_id: int) -> str:
    """Return an <img> tag for the open-tracking pixel."""
    base = _get_base_url()
    return f'<img src="{base}/api/t/o/{send_id}.png" width="1" height="1" style="display:none" alt="" />'


def build_click_url(send_id: int, destination: str) -> str:
    """Return a click-tracking redirect URL."""
    base = _get_base_url()
    return f"{base}/api/t/c/{send_id}?url={quote(destination, safe='')}"


def inject_tracking_pixel(html: str, send_id: int) -> str:
    """Insert open-tracking pixel just before </body> in HTML emails."""
    pixel = build_open_pixel(send_id)
    if "</body>" in html.lower():
        # Insert before closing body tag
        idx = html.lower().rfind("</body>")
        return html[:idx] + pixel + html[idx:]
    # No body tag, append at end
    return html + pixel


def wrap_links_html(html: str, send_id: int) -> str:
    """Rewrite href URLs in HTML to go through click tracker.

    Skips mailto: links and unsubscribe URLs (those should work directly).
    """
    def _replace(match):
        url = match.group(1)
        # Skip mailto, tel, anchor links, and unsubscribe
        if url.startswith(("mailto:", "tel:", "#", "javascript:")) or "unsubscribe" in url.lower():
            return match.group(0)
        tracked = build_click_url(send_id, url)
        return f'href="{tracked}"'

    return re.sub(r'href="([^"]+)"', _replace, html, flags=re.IGNORECASE)


def wrap_links_plain(text: str, send_id: int) -> str:
    """Rewrite bare URLs in plain text to go through click tracker.

    Skips unsubscribe URLs.
    """
    def _replace(match):
        url = match.group(0)
        if "unsubscribe" in url.lower():
            return url
        return build_click_url(send_id, url)

    return re.sub(r'https?://[^\s<>"]+', _replace, text)


def add_tracking(
    send_id: int,
    html: str | None = None,
    plain_text: str | None = None,
) -> tuple[str | None, str | None]:
    """Add tracking to email content. Returns (html, plain_text) with tracking injected.

    - HTML: gets both open pixel and link wrapping
    - Plain text: gets link wrapping only (no pixel possible)
    """
    tracked_html = None
    tracked_plain = None

    if html:
        tracked_html = inject_tracking_pixel(html, send_id)
        tracked_html = wrap_links_html(tracked_html, send_id)

    if plain_text:
        tracked_plain = wrap_links_plain(plain_text, send_id)

    return tracked_html, tracked_plain
