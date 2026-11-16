"""The brand in one place, for the backend: the name, the site's address, the
address people write to. ActorRise is becoming Ghost Light (Canberk,
2026-11-16, domain ghostlight.actor); the switch is meant to be an edit here
and in lib/brand.ts, plus the SITE_URL env on Render.

Not brand, so never read from here: the API host (api.actorrise.com, which
every installed app calls and which stays), the X-ActorRise-Locale header,
the sending addresses until email moves to the new domain.
"""

import os

BRAND_NAME = "ActorRise"

#: Production site, no trailing slash. The SITE_URL env wins when set.
DEFAULT_SITE_URL = "https://actorrise.com"

#: Where actors and teachers write to me.
SUPPORT_EMAIL = "canberk@actorrise.com"


def site_url() -> str:
    """The site's base URL, read when asked, so a test or a changed env holds."""
    return os.getenv("SITE_URL", DEFAULT_SITE_URL)
