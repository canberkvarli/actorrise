"""
GA4 Measurement Protocol — server-side conversion events.

Why these do not live in the browser: purchase and trial events fired client-side
get eaten by ad blockers, and the ones that survive are still fired on a page the
user reaches only after Stripe redirects them back. Anyone who closes the tab on
the Stripe success screen never reports the conversion. Firing from the webhook
means the event follows the money, not the browser.

Requires two env vars:

    NEXT_PUBLIC_GA_MEASUREMENT_ID   the G-XXXXXXXX stream id (same one the
                                    frontend uses; named for the frontend
                                    because that is where it was set first)
    GA4_API_SECRET                  GA4 Admin -> Data Streams -> your stream ->
                                    Measurement Protocol API secrets -> Create

With either missing, every function here becomes a no-op. That is deliberate:
analytics must never be able to fail a webhook, and local/staging should not be
writing into the production property.

Client-ID stitching
-------------------
GA4 needs a client_id to attribute an event to a user's existing session. The
browser holds it in the `_ga` cookie, so the frontend reads it at checkout and
passes it through Stripe metadata as `ga_client_id`. When it is present the trial
lands on the same GA4 user as the search and the signup that preceded it, and the
whole path is one funnel. When it is absent (payment-link checkouts, where there
was never an ActorRise page in the flow) we fall back to a deterministic
synthetic id derived from the user id, so the conversion is still counted, just
not joined to a session.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.request

logger = logging.getLogger(__name__)

_GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect"
_TIMEOUT_SECONDS = 5


def _credentials() -> tuple[str, str] | None:
    measurement_id = (os.getenv("NEXT_PUBLIC_GA_MEASUREMENT_ID") or "").strip()
    api_secret = (os.getenv("GA4_API_SECRET") or "").strip()
    if not measurement_id or not api_secret:
        return None
    return measurement_id, api_secret


def _synthetic_client_id(user_id: int) -> str:
    """
    A stable stand-in when the real `_ga` cookie never reached us.

    GA4 expects the `<random>.<timestamp>` shape. Both halves are derived from
    the user id so the same user always maps to the same synthetic client, which
    keeps repeat events (trial -> converted) on one user rather than three.
    """
    return f"{1_000_000_000 + user_id}.{1_000_000_000 + user_id}"


def _send(client_id: str, event_name: str, params: dict) -> None:
    """Fire and forget, on a daemon thread. Never raises into the caller."""
    creds = _credentials()
    if creds is None:
        logger.debug("GA4 not configured; dropping %s", event_name)
        return
    measurement_id, api_secret = creds

    payload = {
        "client_id": client_id,
        "non_personalized_ads": True,
        "events": [{"name": event_name, "params": params}],
    }
    url = f"{_GA4_ENDPOINT}?measurement_id={measurement_id}&api_secret={api_secret}"

    def _post() -> None:
        try:
            request = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
                # GA4 answers 204 on success and, unhelpfully, 2xx on malformed
                # payloads too. Validation lives at /debug/mp/collect if a new
                # event ever needs checking.
                if response.status >= 300:
                    logger.warning(
                        "GA4 %s returned HTTP %s", event_name, response.status
                    )
        except Exception:
            # An analytics outage must never surface as a failed Stripe webhook:
            # Stripe would retry the delivery and we would double-grant a plan.
            logger.warning("GA4 %s failed to send", event_name, exc_info=True)

    threading.Thread(target=_post, daemon=True).start()


def _client_id(ga_client_id: str | None, user_id: int) -> str:
    cleaned = (ga_client_id or "").strip()
    return cleaned or _synthetic_client_id(user_id)


def track_trial_started(
    *,
    user_id: int,
    tier: str,
    trial_days: int,
    value: float,
    ga_client_id: str | None = None,
    currency: str = "USD",
) -> None:
    """Card on file, nothing charged yet. The moment the money path is entered."""
    _send(
        _client_id(ga_client_id, user_id),
        "trial_started",
        {
            "tier": tier,
            "trial_days": trial_days,
            "value": value,
            "currency": currency,
        },
    )


def track_trial_converted(
    *,
    user_id: int,
    tier: str,
    value: float,
    ga_client_id: str | None = None,
    currency: str = "USD",
) -> None:
    """First real charge landed. This is the one to mark as a GA4 key event."""
    _send(
        _client_id(ga_client_id, user_id),
        "trial_converted",
        {
            "tier": tier,
            "value": value,
            "currency": currency,
        },
    )


def track_trial_cancelled(
    *,
    user_id: int,
    tier: str,
    days_into_trial: int | None = None,
    ga_client_id: str | None = None,
) -> None:
    """Cancelled before the first charge. Paired with trial_started this is churn."""
    params: dict = {"tier": tier}
    if days_into_trial is not None:
        params["days_into_trial"] = days_into_trial
    _send(_client_id(ga_client_id, user_id), "trial_cancelled", params)
