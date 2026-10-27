"""Cue's reply loop: caps, the model, tools, the number guard, handoffs, storage.

`respond()` is a plain generator of event dicts. The API wraps it as SSE; the
tests read it directly. It opens its own DB session because a streaming body
outlives the request's (see second-connection-inside-a-request memory).
"""

from __future__ import annotations

import html
import json
import logging
import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator

from app.models.cue import CueConversation, CueMessage
from app.models.feedback import ResultFeedback
from app.models.user import User
from app.services.cue import caps, guard, tools
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
HISTORY_TURNS = 20
MAX_TOOL_ROUNDS = 4

RESTING = "I'm resting for today. I've passed your question to Canberk, he reads everything and will reply by email."
PLUS_CAP = "That's a lot of questions for one day, I need a breather. I'm back tomorrow, and anything urgent can go to canberk@actorrise.com."
NOT_READY = "I'm not switched on yet. Email canberk@actorrise.com and he'll get back to you."
FALLBACK = "I can't help with that one. Want me to pass it to Canberk?"

# A second net under the prompt. If the actor's own words say teacher, money,
# bug or delete, the conversation reaches Canberk even if the model forgets.
_BACKSTOP = [
    ("teacher", re.compile(r"\b(i teach|teacher|my students|my class(es)?|classroom|drama department|acting coach|i coach)\b", re.I)),
    ("organization", re.compile(r"\b(our (school|studio|theat(er|re)|company|program)|acting school|conservatory|organi[sz]ation|for a group)\b", re.I)),
    ("billing", re.compile(r"\b(refund|charged|charge me|billing|invoice|receipt|payment|cancel(l?ing)? my|my subscription)\b", re.I)),
    ("bug", re.compile(r"\b(bug|broken|not working|doesn'?t work|won'?t (load|open|play)|crash(ed|es)?|error)\b", re.I)),
    ("account", re.compile(r"\b(delete (my )?(account|data)|remove my (account|data)|close my account)\b", re.I)),
]


@lru_cache(maxsize=1)
def system_prompt() -> str:
    facts = (HERE / "facts.md").read_text()
    return (HERE / "prompt.md").read_text().replace("{facts}", facts)


def backstop_reason(text: str) -> str | None:
    for reason, rx in _BACKSTOP:
        if rx.search(text):
            return reason
    return None


def _client():
    if not os.getenv("ANTHROPIC_API_KEY"):
        return None
    import anthropic

    return anthropic.Anthropic()


def call_model(client, **kwargs) -> Iterator[tuple[str, Any]]:
    """Yield ("text", chunk) as it streams, then ("final", message)."""
    with client.messages.stream(**kwargs) as stream:
        for chunk in stream.text_stream:
            yield "text", chunk
        yield "final", stream.get_final_message()


def today_conversation(db: Session, user_id: int, create: bool) -> CueConversation | None:
    conv = (
        db.query(CueConversation)
        .filter(CueConversation.user_id == user_id, CueConversation.started_at >= caps.day_start())
        .order_by(CueConversation.id.desc())
        .first()
    )
    if conv or not create:
        return conv
    conv = CueConversation(user_id=user_id)
    db.add(conv)
    db.flush()
    return conv


def hand_off(db: Session, user: User, conv: CueConversation, reason: str, summary: str) -> None:
    """Into the feedback inbox (which already has the badge) and Canberk's email."""
    if conv.handoff_at is not None and conv.handoff_reason == reason:
        return
    now = datetime.now(timezone.utc)
    conv.handoff_at = now  # type: ignore[assignment]
    conv.handoff_reason = reason  # type: ignore[assignment]
    conv.read_at = None  # type: ignore[assignment]
    comment = f"[cue={conv.id} reason={reason}] {summary.strip()}"
    db.add(ResultFeedback(context="cue", rating="negative", comment=comment[:2000], user_id=user.id, created_at=now))
    db.commit()
    _email_handoff(user, conv, reason, summary)


def _email_handoff(user: User, conv: CueConversation, reason: str, summary: str) -> None:
    try:
        from app.services.email.resend_client import ResendEmailClient

        lines = "".join(
            f"<p style='margin:0 0 8px'><b>{'them' if m.role == 'user' else 'Cue'}:</b> {html.escape(m.content)}</p>"
            for m in conv.messages[-12:]
        )
        body = f"""
        <div style="font-family: sans-serif; max-width: 560px;">
          <p style="color:#CB4B00; font-weight:600; margin:0 0 12px;">from Cue · {html.escape(reason)}</p>
          <p style="font-size:16px; line-height:1.5; margin:0 0 16px;">{html.escape(summary)}</p>
          <p style="color:#666; font-size:13px; margin:0 0 16px;">{html.escape(user.email or "")}</p>
          <div style="font-size:14px; line-height:1.5; border-left:3px solid #CB4B00; padding-left:12px;">{lines}</div>
          <p style="color:#999; font-size:12px; margin:16px 0 0;">actorrise.com/admin/cue?c={conv.id}</p>
        </div>"""
        ResendEmailClient().send_email(
            to="canberk@actorrise.com",
            subject=f"Cue: {reason} from {user.email}",
            html=body,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("cue handoff email failed: %s", e)


def _history(conv: CueConversation) -> list[dict[str, Any]]:
    msgs = [{"role": m.role, "content": m.content} for m in conv.messages if m.content][-HISTORY_TURNS:]
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    return msgs


def respond(db: Session, user: User, text: str, client=None) -> Iterator[dict[str, Any]]:
    text = text.strip()[:2000]
    plus = tools.is_plus(db, user)
    cap = caps.check(db, int(user.id), plus)

    if not cap.allowed and cap.reason == "free_cap":
        yield {"type": "capped", "reason": "free_cap", "limit": cap.limit}
        return

    conv = today_conversation(db, int(user.id), create=True)
    assert conv is not None
    db.add(CueMessage(conversation_id=conv.id, user_id=user.id, role="user", content=text))
    db.commit()

    if not cap.allowed:
        reply = PLUS_CAP if cap.reason == "plus_cap" else RESTING
        if cap.reason == "resting":
            hand_off(db, user, conv, "resting", text)
        yield from _finish(db, conv, user, reply, [], 0, 0, handed_off=cap.reason == "resting")
        return

    client = client if client is not None else _client()
    if client is None:
        hand_off(db, user, conv, "resting", text)
        yield from _finish(db, conv, user, NOT_READY, [], 0, 0, handed_off=True)
        return

    db.refresh(conv)
    messages: list[dict[str, Any]] = _history(conv)
    gate = guard.SentenceGate()
    said: list[str] = []
    used_tools: list[str] = []
    tokens_in = tokens_out = 0
    handed_off = False

    for _round in range(MAX_TOOL_ROUNDS):
        final = None
        try:
            for kind, payload in call_model(
                client,
                model=caps.MODEL,
                max_tokens=2048,
                system=[{"type": "text", "text": system_prompt(), "cache_control": {"type": "ephemeral"}}],
                tools=tools.DEFINITIONS,
                messages=messages,
                output_config={"effort": "low"},
            ):
                if kind == "text":
                    for piece in gate.feed(payload):
                        said.append(piece)
                        yield {"type": "text", "text": piece}
                else:
                    final = payload
        except Exception as e:  # noqa: BLE001
            logger.warning("cue model call failed: %s", e)
            final = None
        for piece in gate.flush():
            said.append(piece)
            yield {"type": "text", "text": piece}

        if final is None:
            if not said:
                said.append(FALLBACK)
                yield {"type": "text", "text": FALLBACK}
            break
        usage = getattr(final, "usage", None)
        if usage is not None:
            tokens_in += int(getattr(usage, "input_tokens", 0) or 0) + int(getattr(usage, "cache_read_input_tokens", 0) or 0) + int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
            tokens_out += int(getattr(usage, "output_tokens", 0) or 0)

        if final.stop_reason == "refusal":
            if not said:
                said.append(FALLBACK)
                yield {"type": "text", "text": FALLBACK}
            break
        if final.stop_reason != "tool_use":
            break

        messages.append({"role": "assistant", "content": final.content})
        results = []
        for block in final.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            name, args = block.name, dict(block.input or {})
            used_tools.append(name)
            yield {"type": "tool", "name": name}
            if name == "hand_off":
                hand_off(db, user, conv, str(args.get("reason") or "asked"), str(args.get("summary") or text))
                handed_off = True
                out: dict[str, Any] = {"ok": True, "note": "Canberk will see this and reply by email."}
            else:
                out = tools.run(name, args, db, user)
                if name in tools.NUMBER_SOURCES:
                    gate.allowed |= guard.allowed_numbers([out])
            results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(out, default=str)})
        messages.append({"role": "user", "content": results})
        if said and not said[-1].endswith((" ", "\n")):
            said.append(" ")
            yield {"type": "text", "text": " "}

    reason = backstop_reason(text)
    if reason and not handed_off:
        hand_off(db, user, conv, reason, text)
        handed_off = True

    yield from _finish(db, conv, user, "".join(said).strip(), used_tools, tokens_in, tokens_out, handed_off,
                       streamed=True)


def _finish(db: Session, conv: CueConversation, user: User, reply: str, used_tools: list[str],
            tokens_in: int, tokens_out: int, handed_off: bool,
            streamed: bool = False) -> Iterator[dict[str, Any]]:
    if not streamed:
        yield {"type": "text", "text": reply}
    db.add(CueMessage(
        conversation_id=conv.id, user_id=user.id, role="assistant", content=reply or FALLBACK,
        tools=used_tools or None, input_tokens=tokens_in, output_tokens=tokens_out,
    ))
    conv.last_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    db.commit()
    yield {"type": "done", "reply": reply, "handed_off": handed_off, "conversation_id": conv.id}
