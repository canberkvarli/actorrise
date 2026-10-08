"""Write product events (app/models/user_event.py).

Modelled on services/community.record_event: fire-and-forget, own session,
swallows every error. Instrumentation must never take a request down with it.

The vocabulary is closed on purpose. If a name is not in EVENT_NAMES the call is
a silent no-op, and only CLIENT_EVENT_NAMES may arrive over POST /api/events;
the rest are emitted by the backend at the moment the thing actually happened.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.core.database import SessionLocal
from app.models.user_event import UserEvent

logger = logging.getLogger(__name__)

# Emitted by the backend where the fact is known for certain.
SERVER_EVENT_NAMES = frozenset(
    {
        "signup_completed",  # users row created with a real email (auth.get_current_user)
        "onboarding_completed",  # has_completed_profile_onboarding flipped false -> true
        "first_search_submitted",  # the user's first search_logs row
        "trial_ended",  # {subscription_id, outcome: converted|cancelled|past_due|...}
        "trial_converted",  # first real charge on a subscription that had a trial
        # The two facts the webhook is sure of and only ever told GA4. Without
        # them checkout_started has no other end, and "abandoned" cannot be
        # computed at all.
        "checkout_completed",  # {subscription_id, tier, billing_period, trial}
        "trial_started",  # {subscription_id, trial_days, earned}
        # One row per lifecycle or triggered email that actually left.
        "email_sent",  # {touch}
        # What a searcher actually does next. 240 of the 242 people who
        # searched in the last 30 days opened a monologue; 17 rehearsed a
        # scene. Working a monologue wrote nothing at all, so the activation
        # number only ever counted the minority path. Emitted at the metered
        # start, after the gate: a 403 is a paywall, not a rehearsal.
        "monologue_work_started",  # {monologue_id}
        # One row per RevenueCat webhook event that matched a user: the Ghost
        # Light iOS app's money trail. Until 2026-10-06 every delivery failed
        # on auth and two paying subscribers were invisible to the backend.
        "app_subscription_event",  # {type, product_id, store, period_type, environment, price, expires_at}
        # The audition tracker (services/auditions). Written where the fact is
        # certain: the row exists, the status moved, the email left.
        "audition_created",  # {source: parse|manual|onboarding, kind, has_sides, has_material}
        "audition_status_changed",  # {audition_id, from, to}
        "audition_outcome_logged",  # {audition_id, outcome: good|callback|no, via: email|app}
        "audition_parse_requested",  # {has_pdf, has_text}; also the free quota counter
        "audition_parse_failed",  # {reason}
        "audition_reminder_sent",  # {audition_id, moment: prep|eve|after}
    }
)

# Emitted by the browser through POST /api/events.
CLIENT_EVENT_NAMES = frozenset(
    {
        "onboarding_step_viewed",  # {step, key}
        "onboarding_question_skipped",  # {step, key, variant}: skip skips one question since 2026-10-02
        "search_box_focused",  # once per /monologues mount
        # Collection depth: 167 favorites, 2 cuts, 2 notes, 13 memorized. These
        # split "never found the feature" from "found it, didn't want it".
        "cut_editor_opened",  # {monologue_id, surface}
        "notes_field_focused",  # {monologue_id}, once per detail-page mount
        "memorized_toggled",  # {monologue_id, memorized}
        # Margin notes replaced the one box at the foot of the page, on the
        # evidence that the box had been written in twice in the product's
        # life at an average of 30 characters. These are how we find out
        # whether writing on the line itself actually gets used — without
        # them the next read of that number is a guess.
        "beat_saved",  # {monologue_id, segment_index, length, total_beats}
        "beat_cleared",  # same shape; length is 0
        # The other half of monologue_work_started. The run reaching its last
        # line was already known — it fires trackRehearsalCompleted to GA4 —
        # and was thrown away rather than kept where the funnel could join it.
        "monologue_work_finished",  # {monologue_id, lines}
        # Why a rehearsal stalls. 13 of 24 sessions in the 30 days to 2026-09-17
        # timed out after 1.7 lines of 6, and every iOS session on record — 7 of
        # them — has finished zero times. The cause is already known (iOS Safari
        # exposes webkitSpeechRecognition and then fails at start()), and
        # MonologueCueing falls back to tap-to-advance when it detects that. What
        # nothing records is whether the fallback ACTUALLY engaged, so a session
        # the fallback rescued and one where the actor sat watching "Listening"
        # look identical afterwards.
        "rehearsal_input_mode",  # {mode: voice|tap, reason, error, platform}
        # Voice genuinely worked: the transcript advanced a line. Fired once per
        # run, on the first such advance, so the volume is one row per session
        # rather than one per line. Without it "mode: voice" only means we
        # committed to voice, not that the actor was ever heard.
        "rehearsal_voice_advanced",  # {platform, line_index}
        # One row per delivered scene line, carrying what the microphone made
        # of it. Found necessary on 2026-09-24: three sessions in a row failed
        # on the founder's own laptop and nothing recorded whether the take
        # ever heard voice, how long it ran, or which rule finally moved the
        # line. `via` is sr_finished | sr_dropped_tail | sr_trailed_off |
        # whisper | silent_skip | manual; sr_match is the fraction of the line
        # the live recogniser matched; voiced_ms and floor_db come from the
        # level gate (lib/voice-gate.ts).
        # sr_results is how many interim results the live recogniser produced on
        # the take and sr_error its last error, added after session 402
        # (2026-09-26) showed 12 s of voice, sr_match 0 and no way to tell
        # whether recognition had said anything at all.
        "scene_line_delivered",  # {via, guided, line_index, take_ms, voiced_ms, floor_db, sr_match, whisper_score, sr_results, sr_error}
        # The guided first scene (2026-09-26). 513 people a month opened
        # /practice and about 25 opened a scene. These three say whether the
        # invitation is taken and whether the run survives its first line;
        # scene_line_delivered carries guided=true on those runs.
        "guided_scene_shown",  # {}
        "guided_scene_started",  # {platform}
        "guided_scene_finished",  # {lines_heard, tap_mode, take_ms_total}
        # The money. On 2026-09-27 real charges were $60 a month from five
        # people, and nothing in Postgres said how many actors ever saw a price:
        # the upgrade modal and the trial offer reported to GA4 only. These
        # mirror those, plus the moment a checkout actually starts, so the funnel
        # signup -> wall seen -> checkout -> trial_ended is one query.
        "upgrade_modal_viewed",  # {feature, tier_current}
        "trial_offer_shown",  # {trigger, tier_current}
        "trial_offer_dismissed",  # {trigger, tier_current}
        "checkout_started",  # {tier, billing_period, trial, entry_point}
        # One name for every moment a price is shown, whatever drew it. `gate`
        # is the old feature or trigger value; `kind` is wall (a limit said no)
        # or ask (something went well). upgrade_modal_viewed and
        # trial_offer_shown keep firing so rows before 2026-09-29 still join.
        "paywall_hit",  # {gate, kind, variant, surface, tier_current}
        "paywall_dismissed",  # {gate, kind, surface, tier_current}
        "paywall_cta_clicked",  # {gate, kind, variant, surface, tier_current}
        "email_clicked",  # {touch}
        # Why a scene run died, next to rehearsal_sessions.failure_reason, which
        # is a closed word list. 2026-09-27: three new actors left the guided
        # scene inside 3 to 16 seconds and "never_began" was all we had.
        "scene_run_abandoned",  # {reason, guided, armed, mic_status, speech_error, load_error, gate_checked, partner_played, line_index, seconds}
        # Audition tracker, browser side.
        "audition_parse_corrected",  # {fields}: parsed fields the actor changed before saving
        "audition_prep_started",  # {audition_id, kind: sides|monologue}
        "audition_reminder_clicked",  # {audition_id, moment}: landed from a reminder link
        "audition_landing_shown",  # {audition_id}: login sent them to the prep room
        "audition_strip_clicked",  # {surface: rehearse|monologues|winback_email}
        "calendar_feed_subscribed",  # {provider: google|apple|outlook|copy, surface: header|first_save}
    }
)

EVENT_NAMES = SERVER_EVENT_NAMES | CLIENT_EVENT_NAMES

# Properties are context, not a dumping ground: a handful of short scalars.
MAX_PROPERTY_KEYS = 12
MAX_STRING_LEN = 200
_SCALARS = (str, int, float, bool)


def sanitize_properties(props: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Keep up to MAX_PROPERTY_KEYS scalar values; truncate strings; drop the rest."""
    if not isinstance(props, dict):
        return {}
    out: dict[str, Any] = {}
    for key, value in props.items():
        if len(out) >= MAX_PROPERTY_KEYS:
            break
        if not isinstance(key, str) or not key or len(key) > 48:
            continue
        if value is None:
            continue
        if isinstance(value, bool):
            out[key] = value
        elif isinstance(value, _SCALARS):
            out[key] = value[:MAX_STRING_LEN] if isinstance(value, str) else value
    return out


def trial_outcome(stripe_status: str) -> str:
    """Stripe's post-trial status as an outcome word.

    `active` after `trialing` is NOT a conversion. Stripe flips the status the
    moment the trial ends and only then tries the card; on 2026-09-30 a trial
    was reported converted at 16:17:16 and declined (closed account) seconds
    later. The conversion is `invoice.paid`, which records `trial_converted`.
    `canceled` is spelt our way so the two webhook paths that can report a
    cancellation agree on the label. Anything else (past_due, unpaid,
    incomplete_expired) is kept verbatim.
    """
    if stripe_status == "active":
        return "awaiting_payment"
    if stripe_status == "canceled":
        return "cancelled"
    return stripe_status or "unknown"


def record_subscription_event(
    db,
    user_id: Optional[int],
    event_name: str,
    subscription_id: Optional[str],
    **extra: Any,
) -> bool:
    """One `event_name` per Stripe subscription, whichever webhook says so first.

    Stripe retries, and a trial's end can reach us three ways (invoice.paid,
    subscription.updated with previous status trialing, subscription.deleted
    inside the trial window) in no fixed order. The subscription id in the
    properties is the dedupe key.
    """
    try:
        if subscription_id:
            dup = (
                db.query(UserEvent.id)
                .filter(
                    UserEvent.event_name == event_name,
                    UserEvent.properties["subscription_id"].as_string() == subscription_id,
                )
                .first()
            )
            if dup is not None:
                return False
    except Exception:
        # A failed lookup must not block the write; a rare duplicate is a
        # smaller error than a missing row.
        try:
            db.rollback()
        except Exception:
            pass
    return record_user_event(
        user_id,
        event_name,
        {"subscription_id": subscription_id, **extra},
    )


def record_trial_ended(
    db,
    user_id: Optional[int],
    subscription_id: Optional[str],
    outcome: str,
    **extra: Any,
) -> bool:
    """One trial_ended per Stripe subscription, labelled with how it ended.

    Deduped on the subscription id, so trial-to-paid stays a plain
    count(trial_converted) / count(trial_ended).
    """
    return record_subscription_event(
        db, user_id, "trial_ended", subscription_id, outcome=outcome, **extra
    )


def record_user_event(
    user_id: Optional[int],
    event_name: str,
    properties: Optional[dict[str, Any]] = None,
) -> bool:
    """Insert one event. Returns True when a row was written. Never raises."""
    try:
        if event_name not in EVENT_NAMES:
            return False
        row = UserEvent(
            user_id=user_id,
            event_name=event_name,
            properties=sanitize_properties(properties),
        )
        db = SessionLocal()
        try:
            db.add(row)
            db.commit()
            return True
        finally:
            db.close()
    except Exception:
        # json.dumps in the message so a bad payload is at least visible in logs.
        logger.debug(
            "user_event dropped: %s %s", event_name, json.dumps(properties, default=str)[:300]
        )
        return False
