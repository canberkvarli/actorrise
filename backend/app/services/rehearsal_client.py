"""What a rehearsal was running on, read off the User-Agent.

A rehearsal session records nothing about the machine it ran on, so none of the
51 failed sessions in the last 60 days can be attributed to anything. 45% of
them are `timed_out`, set server-side by a sweep long after the browser has
gone, so no beacon from the client will ever reach them: whatever is recorded
has to be recorded at the start, on a request that must succeed for the session
to exist at all.

The standing explanation for the deaths — iOS Safari reporting speech
recognition and then refusing to do it, or an in-app webview blocking it — has
been an inference from a device split since 2026-08-29 and has never been
checked against a session that actually died. This is what makes that possible.

Coarse on purpose. A platform and a browser family are the two axes the
question is about; a version string is a column nobody will ever group by, and
anything finer starts being a fingerprint.
"""

from __future__ import annotations

import re
from typing import Optional

_MAX = 32


def _clean(value: Optional[str]) -> str:
    return (value or "")[:1000]


def client_platform(user_agent: Optional[str]) -> Optional[str]:
    """"ios", "android", "desktop", or None when the string says nothing.

    iPad is iOS. It is the same speech engine refusing in the same way, and
    splitting them would halve the one number this exists to measure.
    """
    ua = _clean(user_agent).lower()
    if not ua:
        return None
    if "android" in ua:
        return "android"
    if any(k in ua for k in ("iphone", "ipad", "ipod")):
        return "ios"
    # iPadOS 13+ reports itself as a Mac; the touch hint is what gives it away.
    if "macintosh" in ua and "mobile/" in ua:
        return "ios"
    if any(k in ua for k in ("windows", "macintosh", "cros", "linux")):
        return "desktop"
    return None


def client_browser(user_agent: Optional[str]) -> Optional[str]:
    """The browser family, or None.

    Order matters more than the patterns do. Every one of these says "Safari"
    somewhere, and Chrome on iOS says it while being neither: an in-app webview
    filed as Safari is invisible, and it is one of the two suspects for speech
    being refused.
    """
    ua = _clean(user_agent)
    if not ua:
        return None
    lowered = ua.lower()

    # In-app webviews first: they wear another browser's name.
    for needle, name in (
        ("instagram", "instagram"),
        ("fbav", "facebook"),
        ("fb_iab", "facebook"),
        ("tiktok", "tiktok"),
        ("musical_ly", "tiktok"),
        ("snapchat", "snapchat"),
        ("linkedinapp", "linkedin"),
    ):
        if needle in lowered:
            return name

    for pattern, name in (
        (r"edg[ea]?/", "edge"),
        (r"opr/|opera", "opera"),
        (r"crios/", "chrome"),   # Chrome on iOS, before the Safari check
        (r"fxios/", "firefox"),
        (r"firefox/", "firefox"),
        (r"samsungbrowser/", "samsung"),
        (r"chrome/|chromium/", "chrome"),
        (r"safari/", "safari"),
    ):
        if re.search(pattern, lowered):
            return name[:_MAX]
    return None
