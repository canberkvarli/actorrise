"""
Telling the actor who asked, once the title they tracked lands.

The consent gate is the whole design: only somebody who pressed track gets a
note. See docs/plans/2026-09-07-requested-title-notification-design.md.
"""

import re

import pytest

from app.api.admin.searches import _requested_title_email


@pytest.fixture
def body():
    return _requested_title_email(
        "Sam", "The Humans", "https://actorrise.com/monologues?monologue=42", 3
    )


# ── Voice rules from CLAUDE.md, enforced rather than trusted ────────────────


def test_no_dash_of_any_kind(body):
    """Em dash, en dash and the long hyphen all read as AI-written."""
    for ch in ("—", "–", "‒", "―"):
        assert ch not in body, f"found {ch!r}"


def test_first_person_singular_only(body):
    for word in (r"\bwe\b", r"\bour\b", r"\bus\b", r"\bthe ActorRise team\b"):
        assert not re.search(word, body, re.IGNORECASE), f"found {word}"
    assert " I " in body or body.startswith("I ") or "I'll" in body or "I pick" in body


def test_signed_canberk_not_a_team(body):
    assert "Canberk" in body
    assert "Team" not in body


def test_carries_a_plain_reply_opt_out(body):
    """The /unsubscribe page's "Other" reason has no free-text field, so the
    reply route has to be offered in the body itself."""
    assert "UNSUBSCRIBE" in body


def test_no_emoji(body):
    assert all(ord(c) < 0x2190 for c in body)


def test_no_corporate_speak(body):
    for phrase in ("excited to announce", "leverage", "unlock", "revolutionize",
                   "game-changer", "delighted to"):
        assert phrase not in body.lower()


# ── The offer itself ────────────────────────────────────────────────────────


def test_no_trial_pitch_and_no_curtain(body):
    """CURTAIN is first-touch only, and answering someone's request is
    mid-conversation. A sale here would make the pretext look manufactured."""
    assert "CURTAIN" not in body
    assert "stripe" not in body.lower()
    assert "trial" not in body.lower()


def test_names_the_title_and_links_the_piece(body):
    assert "The Humans" in body
    assert "https://actorrise.com/monologues?monologue=42" in body


def test_thanks_them_for_flagging(body):
    """Load-bearing: it tells the actor the press had an effect, which is what
    turns the track button from a complaint button into a request button."""
    assert "Thanks for flagging" in body


@pytest.mark.parametrize("n,expected", [(1, "1 piece"), (3, "3 pieces")])
def test_piece_count_is_pluralised(n, expected):
    out = _requested_title_email("Sam", "X", "http://u", n)
    assert expected in out
