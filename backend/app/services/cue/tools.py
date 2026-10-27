"""What Cue can look up and do. Everything it says about the app comes from here.

Each tool returns plain JSON-able data. None of them returns monologue or scene
text: Cue points to a piece, it never recites one (film and TV text especially).
`hand_off` is declared here but run by the agent, because it needs the
conversation.
"""

from __future__ import annotations

import logging
from typing import Any

from app.models.actor import Monologue, MonologueFavorite, Play
from app.models.billing import PricingTier
from app.models.user import User
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, undefer

logger = logging.getLogger(__name__)

PAGES = {
    "library": "/monologues",
    "collection": "/rehearse",
    "scenepartner": "/practice",
    "auditions": "/auditions",
    "profile": "/profile",
    "billing": "/billing",
    "help": "/help",
    "pricing": "/pricing",
}

HANDOFF_REASONS = ["teacher", "organization", "billing", "bug", "account", "personal", "asked", "unknown"]

# Tools whose numbers Cue may repeat. Search results carry ids and minutes,
# which must not be able to vouch for a "14 day trial".
NUMBER_SOURCES = {"my_account", "pricing"}

DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "search_monologues",
        "description": "Search the ActorRise monologue library with the app's own search. Use for any request for pieces (by mood, age, gender, length, playwright, play or character). Returns up to 5 real pieces with a link each.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What the actor asked for, in plain words."},
                "gender": {"type": "string", "enum": ["male", "female", "any"]},
                "age_range": {"type": "string", "description": "e.g. 20s, 30s, 40s, 50s, 60+"},
                "max_minutes": {"type": "number", "description": "Longest length wanted, in minutes."},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "check_title",
        "description": "Check whether a title or character is in the library, looking in play titles, monologue titles and character names. Call this before ever saying a title or character is, or is not, in ActorRise.",
        "input_schema": {
            "type": "object",
            "properties": {"text": {"type": "string", "description": "The title or character name to look for."}},
            "required": ["text"],
            "additionalProperties": False,
        },
    },
    {
        "name": "my_account",
        "description": "The actor's own plan, free trial length if they can start one, free reads used and left this month, how many pieces they saved, and their Cue messages used and allowed. Call before stating any of these.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "pricing",
        "description": "The current plans and prices, live from the server. Call before stating any price.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "save_monologue",
        "description": "Save a monologue to the actor's Collection. Only when they ask you to save it.",
        "input_schema": {
            "type": "object",
            "properties": {"monologue_id": {"type": "integer"}},
            "required": ["monologue_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "link",
        "description": "Get the path of a page in the app to point the actor to.",
        "input_schema": {
            "type": "object",
            "properties": {"page": {"type": "string", "enum": list(PAGES)}},
            "required": ["page"],
            "additionalProperties": False,
        },
    },
    {
        "name": "hand_off",
        "description": "Pass this conversation to Canberk, who reads it and replies by email. Required for teachers, schools, studios and organisations, money and billing, bugs, deleting an account, anything personal, and anything you cannot answer from facts and tools.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "enum": HANDOFF_REASONS},
                "summary": {"type": "string", "description": "One or two sentences for Canberk: who they are and what they need."},
            },
            "required": ["reason", "summary"],
            "additionalProperties": False,
        },
    },
]


def _piece(m: Monologue) -> dict[str, Any]:
    play = m.play
    return {
        "id": m.id,
        "title": m.title,
        "character": m.character_name,
        "play": play.title if play else None,
        "author": play.author if play else None,
        "minutes": round((m.estimated_duration_seconds or 0) / 60, 1),
        "tone": m.tone,
        "link": f"/monologue/{m.id}",
    }


def search_monologues(db: Session, user: User, query: str, gender: str | None = None,
                      age_range: str | None = None, max_minutes: float | None = None) -> dict[str, Any]:
    from app.services.search.semantic_search import SemanticSearch

    filters: dict[str, Any] = {}
    if gender and gender != "any":
        filters["gender"] = gender
    if age_range:
        filters["age_range"] = age_range
    if max_minutes:
        filters["max_duration"] = int(max_minutes * 60)
    rows, _ = SemanticSearch(db).search(query, limit=5, filters=filters or None, user_id=int(user.id))
    return {"results": [_piece(m) for m, _score in rows[:5]], "searched_for": query}


def check_title(db: Session, text: str) -> dict[str, Any]:
    """The three-place check: plays.title, monologues.title, monologues.character_name."""
    from app.services.search.semantic_search import review_hides_from_search

    needle = f"%{text.strip()}%"
    plays = (
        db.query(Play.id, Play.title, Play.author)
        .filter(Play.title.ilike(needle))
        .limit(5)
        .all()
    )

    def visible(q):
        rows = q.options(joinedload(Monologue.play), undefer(Monologue.review_status)).limit(25).all()
        return [m for m in rows if not review_hides_from_search(m.review_status)][:5]

    by_title = visible(db.query(Monologue).filter(Monologue.title.ilike(needle)))
    by_character = visible(db.query(Monologue).filter(Monologue.character_name.ilike(needle)))
    by_play = []
    if plays:
        by_play = visible(db.query(Monologue).filter(Monologue.play_id.in_([p.id for p in plays])))
    found = bool(by_title or by_character or by_play)
    return {
        "looked_for": text,
        "found": found,
        "plays_matching_title": [{"title": p.title, "author": p.author} for p in plays],
        "monologues_from_those_plays": [_piece(m) for m in by_play],
        "monologues_matching_title": [_piece(m) for m in by_title],
        "monologues_matching_character": [_piece(m) for m in by_character],
    }


def is_plus(db: Session, user: User) -> bool:
    from app.api.monologues import _user_has_unlimited_reads

    return _user_has_unlimited_reads(int(user.id), db, email=user.email)


def my_account(db: Session, user: User) -> dict[str, Any]:
    from app.api.subscriptions import _trial_fields
    from app.middleware.rate_limiting import distinct_reads, free_read_limit
    from app.models.billing import UserSubscription
    from app.services.cue import caps

    plus = is_plus(db, user)
    sub = db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()
    tier = db.query(PricingTier).get(sub.tier_id) if sub else None
    saved = (
        db.query(func.count(MonologueFavorite.id))
        .filter(MonologueFavorite.user_id == user.id, MonologueFavorite.removed_at.is_(None))
        .scalar()
        or 0
    )
    out: dict[str, Any] = {
        "plan": (tier.display_name if tier and sub and sub.is_active else "Free"),
        "is_plus": plus,
        "status": sub.status if sub else None,
        "saved_pieces": int(saved),
    }
    if plus:
        out["free_reads"] = "unlimited"
        out["cue_messages"] = "plenty, no monthly limit"
    else:
        limit = free_read_limit("web")
        used = distinct_reads(int(user.id), db, client="web")
        out["free_reads_this_month"] = {"used": used, "limit": limit, "left": max(0, limit - used)}
        cue_used = caps.messages_since(db, int(user.id), caps.month_start())
        out["cue_messages_this_month"] = {"used": cue_used, "limit": caps.free_monthly()}
        trial = _trial_fields(db, int(user.id))
        out["trial_days_if_started_now"] = int(trial["trial_days"])
        if not trial["trial_days"]:
            out["trial_note"] = "No free trial is available for this account."
    return out


def pricing(db: Session) -> dict[str, Any]:
    tiers = (
        db.query(PricingTier)
        .filter(PricingTier.is_active == True)  # noqa: E712
        .order_by(PricingTier.sort_order)
        .all()
    )
    return {
        "plans": [
            {
                "name": t.display_name,
                "monthly_price_cents": int(t.monthly_price_cents or 0),
                "annual_price_cents": int(t.annual_price_cents) if t.annual_price_cents else None,
                "description": t.description,
            }
            for t in tiers
        ],
        "currency": "USD",
    }


def save_monologue(db: Session, user: User, monologue_id: int) -> dict[str, Any]:
    m = db.query(Monologue).filter(Monologue.id == monologue_id).first()
    if not m:
        return {"saved": False, "error": "No piece with that id."}
    fav = (
        db.query(MonologueFavorite)
        .filter(MonologueFavorite.user_id == user.id, MonologueFavorite.monologue_id == monologue_id)
        .first()
    )
    if fav and fav.removed_at is None:
        return {"saved": True, "already": True, "title": m.title, "link": "/rehearse"}
    if fav:
        fav.removed_at = None  # type: ignore[assignment]
    else:
        db.add(MonologueFavorite(user_id=user.id, monologue_id=monologue_id))
    m.favorite_count = int(m.favorite_count or 0) + 1  # type: ignore[assignment]
    db.commit()
    return {"saved": True, "title": m.title, "link": "/rehearse"}


def run(name: str, args: dict[str, Any], db: Session, user: User) -> dict[str, Any]:
    """Run one tool. Errors come back as data so Cue can say so instead of guessing."""
    try:
        if name == "search_monologues":
            return search_monologues(db, user, **args)
        if name == "check_title":
            return check_title(db, args["text"])
        if name == "my_account":
            return my_account(db, user)
        if name == "pricing":
            return pricing(db)
        if name == "save_monologue":
            return save_monologue(db, user, int(args["monologue_id"]))
        if name == "link":
            page = args.get("page")
            return {"path": PAGES[page]} if page in PAGES else {"error": "Unknown page."}
        return {"error": f"Unknown tool {name}."}
    except Exception as e:  # noqa: BLE001
        logger.warning("cue tool %s failed: %s", name, e)
        db.rollback()
        return {"error": "That lookup failed. Say you couldn't check it and offer to pass it to Canberk."}
