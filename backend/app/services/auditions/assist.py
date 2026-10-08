"""The AI help on an audition's page: a read on the scene (with what to wear
folded in), and "ask me" about this one audition.

The read is saved on auditions.assist with the inputs it was made from (key),
so a page view never pays twice; it runs again only when those inputs change.
A failure is never an error to the actor: the helper returns None and the page
simply goes without it.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.audition import Audition
from app.services.auditions import core

logger = logging.getLogger(__name__)

TIMEOUT_S = 12
ASKS_PER_MONTH = {"free": 10, "plus": 50, "pro": 200}
ASKS_KEPT = 20
SIDES_CHARS_FOR_MODEL = 6000
LlmCall = Callable[[str], str]


# ---------- shared bits ----------


def _key(*parts: Any) -> str:
    return hashlib.sha1(json.dumps(parts, default=str).encode()).hexdigest()[:16]


def _no_dashes(text: str) -> str:
    """House voice: no em or en dashes, ever. Swap them for commas."""
    return re.sub(r"\s*[–—]\s*", ", ", text).strip()


def _default_llm_call(prompt: str) -> str:
    from app.services.ai.langchain.config import get_llm

    llm = get_llm(model="gpt-4o-mini", temperature=0.3, use_json_format=True, timeout=TIMEOUT_S, max_retries=0)
    return llm.invoke(prompt).content


def _ask_json(call: LlmCall, prompt: str) -> Optional[dict]:
    try:
        raw = json.loads(call(prompt))
    except Exception as exc:  # noqa: BLE001
        logger.warning("audition assist: model failed: %s", exc)
        return None
    return raw if isinstance(raw, dict) else None


def _save(db: Session, a: Audition, part: str, value: Any) -> None:
    data = dict(a.assist) if isinstance(a.assist, dict) else {}
    data[part] = value
    a.assist = data
    flag_modified(a, "assist")
    db.commit()


# ---------- a read on the scene, and what to wear ----------


READ_PROMPT = """You are a working acting coach writing in an actor's notebook before an audition.
Audition: {project}. Role: {role}. Type: {kind}. What they asked for: {material}. Shoot details: {shoots}.
{sides_block}
Return JSON with two keys:
"read": {read_rule}
"wear": a list of 2 or 3 short practical things to wear or bring for this role and room (under 8 words each, no brands, nothing already listed here: {bring}).
Voice for everything: plain words, no dashes of any kind, no emojis, no exclamation marks."""

READ_RULE_SIDES = (
    'one note on how to play the scene, inside parentheses, starting "(my read:", all lowercase, under 45 words. '
    "Name the one thing the character is really fighting for and the moment the scene turns. Quote at most six words of the sides."
)
READ_RULE_NONE = "null"


def read_inputs(db: Session, a: Audition) -> tuple[Optional[str], str]:
    """(sides text or None, cache key). Sides still loading count as none for now."""
    _, status, text = core.sides_text(db, a)
    sides = (text or "").strip() if status in (None, "completed") else ""
    return (sides or None), _key("read", a.user_script_id, bool(sides), a.project, a.role, a.material_raw, a.kind)


def read_scene(db: Session, a: Audition, *, llm_call: Optional[LlmCall] = None) -> Optional[dict]:
    sides, key = read_inputs(db, a)
    if not sides and not (a.role or a.material_raw):
        return None
    saved = (a.assist or {}).get("read") if isinstance(a.assist, dict) else None
    if isinstance(saved, dict) and saved.get("key") == key:
        return saved

    items = core.bring_items(a)
    prompt = READ_PROMPT.format(
        project=a.project, role=a.role or "not given", kind=a.kind, material=a.material_raw or "not given",
        shoots=a.shoots or "not given",
        sides_block=f"Their sides:\n<<<\n{sides[:SIDES_CHARS_FOR_MODEL]}\n>>>" if sides else "No sides yet.",
        read_rule=READ_RULE_SIDES if sides else READ_RULE_NONE,
        bring=", ".join(i["text"] for i in items) or "nothing",
    )
    raw = _ask_json(llm_call or _default_llm_call, prompt)
    if raw is None:
        return None
    line = _no_dashes(str(raw.get("read") or "")) if sides and isinstance(raw.get("read"), str) else None
    if line and not line.startswith("("):
        line = f"({line})"
    wear = [_no_dashes(str(w))[:80] for w in (raw.get("wear") or []) if isinstance(w, str) and w.strip()][:3]

    have = {i["text"].lower() for i in items}
    added = [{"text": w[:1].upper() + w[1:], "done": False, "src": "ai"} for w in wear if w.lower() not in have]
    if added:
        a.bring_list = core.clean_bring_list(items + added)
        flag_modified(a, "bring_list")
    read = {"key": key, "line": line, "wear": wear}
    _save(db, a, "read", read)
    return read


# ---------- ask me ----------


ASK_PROMPT = """You help one actor with one audition. Answer their question in under 90 words, in plain words, as "I".
No dashes of any kind, no emojis. Use only what is below and general, well known practice for auditions.
If the answer depends on something not here (a casting director's habits, a building you do not know), say plainly that you don't know from what's here, and say what you would check.
Return JSON: {{"answer": "..."}}

The audition: {facts}
{sides_block}
Earlier questions: {earlier}

Question: {question}"""


def asks_quota(db: Session, user_id: int, now: datetime) -> dict:
    from app.models.user_event import UserEvent
    from app.services.auditions.parse import _tier

    tier = _tier(db, user_id)
    limit = ASKS_PER_MONTH[tier]
    start = now.astimezone(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = (
        db.query(UserEvent)
        .filter(UserEvent.user_id == user_id, UserEvent.event_name == "audition_asked", UserEvent.created_at >= start)
        .count()
    )
    return {"used": used, "limit": limit, "remaining": max(0, limit - used), "tier": tier}


def ask(db: Session, a: Audition, question: str, now: datetime, *, llm_call: Optional[LlmCall] = None) -> Optional[dict]:
    """{q, a, at} saved on the audition, or None when the model failed."""
    question = question.strip()[:500]
    sides, _ = read_inputs(db, a)
    saved = (a.assist or {}).get("asks") if isinstance(a.assist, dict) else None
    asks = list(saved) if isinstance(saved, list) else []
    facts = {
        "project": a.project, "role": a.role, "kind": a.kind, "when": core._iso(core.when(a)), "timezone": a.tz,
        "where": a.location, "casting": a.casting, "through": a.through, "asked_for": a.material_raw,
        "bring": [i["text"] for i in core.bring_items(a)], "shoots": a.shoots, "notes": a.notes,
    }
    raw = _ask_json(llm_call or _default_llm_call, ASK_PROMPT.format(
        facts=json.dumps(facts, default=str),
        sides_block=f"Their sides:\n<<<\n{sides[:SIDES_CHARS_FOR_MODEL]}\n>>>" if sides else "No sides attached.",
        earlier=json.dumps([{"q": x.get("q"), "a": x.get("a")} for x in asks[-3:]]),
        question=question,
    ))
    answer = _no_dashes(str((raw or {}).get("answer") or ""))
    if not answer:
        return None
    entry = {"q": question, "a": answer[:1200], "at": now.isoformat()}
    _save(db, a, "asks", (asks + [entry])[-ASKS_KEPT:])
    return entry
