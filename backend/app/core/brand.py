"""The brand in one place, for the backend: the name, the site's address, the
address people write to. ActorRise became Ghost Light (Canberk,
2026-11-16, domain ghostlight.actor; actorrise.com 301-redirects here).

Not brand, so never read from here: the API host (api.actorrise.com, which
every installed app calls and which stays), the X-ActorRise-Locale header,
the sending addresses until email moves to the new domain.
"""

import os

BRAND_NAME = "Ghost Light"

#: Production site, no trailing slash. The SITE_URL env wins when set.
DEFAULT_SITE_URL = "https://ghostlight.actor"

#: The address as printed for people to type, without https or www.
SITE_DOMAIN = "ghostlight.actor"

#: Where actors and teachers write to me. Stays on actorrise.com until email moves.
SUPPORT_EMAIL = "canberk@actorrise.com"


def site_url() -> str:
    """The site's base URL, read when asked, so a test or a changed env holds."""
    return os.getenv("SITE_URL", DEFAULT_SITE_URL)
