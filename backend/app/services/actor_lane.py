"""Read an actor's casting lane off their résumé credits.

The model writes the sentence. It never picks the monologues: it returns
structured tags, those tags drive the search that already exists, and anything
outside the corpus vocabulary is dropped. So the prose can be wrong in an
ordinary way (a clumsy line) but never in an expensive one (results nobody can
reproduce).

See docs/plans/2026-09-01-actor-lane-design.md.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable, Optional

from openai import OpenAI
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.actor import ActorCredit, ActorLane, Monologue, Play
from app.services.ai.langchain.embeddings import generate_embedding
from app.services.search.cache_manager import cache_manager

LANE_MODEL = "gpt-4o-mini"

# Under three credits there is no pattern to find, and a confident line drawn
# from one credit is a horoscope.
MIN_CREDITS = 3

# The corpus vocabulary. The model is constrained to these and anything else is
# dropped, because the profile and the corpus have never agreed: profiles store
# "Male" and "25-35", monologues store "male" and "20s". Comparing those two
# directly matches nothing, silently, which is a bug this codebase has shipped
# more than once.
AGE_VALUES = {"child", "teens", "20s", "30s", "40s", "50s", "60+", "any"}
# Corpus stores male / female / any / "either gender".
GENDER_VALUES = {"male", "female", "any"}
# Verified against prod, not guessed. My first pass used comedic/dramatic/
# serio-comic, which would have matched two of these twelve and silently
# dropped the rest.
TONE_VALUES = {
    "defiant", "anguished", "contemplative", "dark", "dramatic", "comedic",
    "philosophical", "inspirational", "sarcastic", "melancholic", "romantic",
    "joyful",
}
# Era is plays.category, not a column on monologues.
ERA_VALUES = {"classical", "contemporary"}


def credits_digest(credits: Iterable[ActorCredit]) -> str:
    """A stable digest of the credit set.

    Sorted so reordering the résumé does not invalidate the lane; only the
    substance of the credits does.
    """
    parts = sorted(
        f"{(c.production or '').strip().lower()}|{(c.role or '').strip().lower()}|"
        f"{(c.category or '').strip().lower()}|{(c.year or '').strip()}"
        for c in credits
    )
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


SYSTEM_PROMPT = """You read an actor's résumé credits and name the lane they get cast in.

Return ONLY JSON with these keys:
  line    a lower case parenthetical aside naming the lane, e.g.
          "(you get cast as the young man who won't sit down.)"
  blurb   one or two short sentences on what connects the roles.
  tags    {"age_skew": <age>, "gender": <gender>, "tones": [<tone>...],
           "eras": [<era>...], "archetype": "<3-5 words>",
           "keywords": [<4-8 single words>]}

Vocabulary you MUST use, exactly. Pick only from these lists:
  age_skew: child, teens, 20s, 30s, 40s, 50s, 60+, any
  gender:   male, female, any   (the gender of the roles listed, not the
            actor's. Use "any" unless the roles clearly skew one way.)
  tones:    defiant, anguished, contemplative, dark, dramatic, comedic,
            philosophical, inspirational, sarcastic, melancholic, romantic,
            joyful   (choose one to three)
  eras:     classical, contemporary

Rules:
- Be generous but true. Name the lane in its best light.
- NEVER say what the actor does not get cast as, and never mention a limit,
  a gap, or a range they have not played. No "never the lead", no "only".
- Write as one person talking to another. Use "you". Never "we".
- NO dashes of any kind. Use commas or full stops.
- No emojis.
- The line is lower case and ends with a full stop inside the bracket. It must
  not contain a proper noun, a play title or a character name.
- Invent nothing. Describe only the credits given.
- If the credits are too few or too scattered to read honestly, return
  {"line": null} and nothing else.

Write like an actor talking to another actor in a bar, not like a bio.
Concrete and plain. The line should be something a person would actually say
out loud, e.g. "(you get cast as the young man who won't sit down.)" or
"(you get cast as the woman everyone else is afraid of.)"
The blurb is ONE short sentence about what the roles have in common.
BANNED words, they read as filler: showcase, showcasing, reflect, reflects,
embody, embodies, journey, dynamic, nuanced, multifaceted, compelling,
resonate, explore, exploration, depth, range, versatile."""


def _client() -> Optional[OpenAI]:
    key = settings.openai_api_key
    return OpenAI(api_key=key) if key else None


def read_lane(credits: list[ActorCredit]) -> Optional[dict[str, Any]]:
    """One model pass. Returns None when it cannot or should not answer."""
    client = _client()
    if client is None:
        return None

    listed = "\n".join(
        f"- {c.role or 'unnamed role'} in {c.production}"
        f"{f' ({c.category})' if c.category else ''}"
        f"{f', {c.year}' if c.year else ''}"
        for c in credits
    )

    try:
        resp = client.chat.completions.create(
            model=LANE_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": listed},
            ],
            response_format={"type": "json_object"},
            max_tokens=400,
            temperature=0.7,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
    except Exception:
        # Never surface a model failure to the actor: the caller falls back to
        # the plain profile recommendations, which is what they saw before.
        return None

    line = (data.get("line") or "").strip()
    if not line:
        return None

    return {
        "line": line,
        "blurb": _clean_blurb(data.get("blurb")),
        "tags": _clean_tags(data.get("tags") or {}),
    }


# Asking the prompt not to use these got most of the way there; "showcase" still
# came back. Enforced here instead, because a prompt is a request and this is a
# rule. The blurb is dropped rather than rewritten: the line carries the value,
# and inventing a replacement sentence would be putting words in the actor's
# mouth about their own career.
_FILLER = (
    "showcase", "showcasing", "reflect", "embody", "journey", "dynamic",
    "nuanced", "multifaceted", "compelling", "resonate", "explore",
    "exploration", "versatile", "tapestry", "testament",
)


def _clean_blurb(raw: Any) -> Optional[str]:
    text = (str(raw or "")).strip()
    if not text:
        return None
    lowered = text.lower()
    if any(word in lowered for word in _FILLER):
        return None
    # An em dash would show up verbatim on the profile. Swallow the surrounding
    # spaces too, or " — " becomes " , ".
    return re.sub(r"\s*[—–]\s*", ", ", text)


def _clean_tags(raw: dict[str, Any]) -> dict[str, Any]:
    """Keep only values the corpus actually holds. Everything else is dropped."""

    def keep(values: Any, allowed: set[str]) -> list[str]:
        if isinstance(values, str):
            values = [values]
        if not isinstance(values, list):
            return []
        return [v for v in (str(x).strip().lower() for x in values) if v in allowed]

    age = str(raw.get("age_skew", "")).strip().lower()
    gender = str(raw.get("gender", "")).strip().lower()
    keywords = raw.get("keywords") or []
    if not isinstance(keywords, list):
        keywords = []

    return {
        "age_skew": age if age in AGE_VALUES else None,
        "gender": gender if gender in GENDER_VALUES else None,
        "tones": keep(raw.get("tones"), TONE_VALUES),
        "eras": keep(raw.get("eras"), ERA_VALUES),
        "archetype": (str(raw.get("archetype") or "").strip() or None),
        "keywords": [str(k).strip() for k in keywords if str(k).strip()][:8],
    }


def _lane_embedding(tags: dict[str, Any]) -> Optional[list[float]]:
    """Embed the lane's own words, cached.

    Cheap on paper and ruinous in practice if uncached: pick_in_lane runs on
    every profile load while the lane row itself is cached, so this would bill
    an embedding per page view. The search cache already keeps query embeddings
    for seven days and is keyed by the string, which is stable for a given lane.
    """
    words = [w for w in (tags.get("keywords") or []) if w]
    archetype = tags.get("archetype")
    if archetype:
        words = [archetype, *words]
    if not words:
        return None

    query = ", ".join(words)
    try:
        cached = cache_manager.get_embedding(query)
        if cached:
            return cached
        vec = generate_embedding(query)
        if vec:
            cache_manager.set_embedding(query, vec)
        return vec
    except Exception:
        # No embedding is a worse lane, not a broken one: the caller falls back
        # to the tag filters and still returns three pieces.
        return None


def pick_in_lane(
    db: Session, tags: dict[str, Any], limit: int = 3, user_id: int = 0
) -> list[Monologue]:
    """Monologues in the lane, widening until it has enough.

    Fails OPEN. /api/scenes/first-rehearsal 404'd for every user for weeks
    because its fallback filtered on the same empty column as the query it was
    meant to rescue. Each step here drops a constraint rather than returning
    nothing, and the last step has no constraints left to drop.
    """
    base = (
        db.query(Monologue)
        .join(Play, Play.id == Monologue.play_id)
        .filter(
            Monologue.review_status.is_(None),
            Monologue.character_name.isnot(None),
            Monologue.character_name != "",
            Play.title.isnot(None),
        )
    )

    age = tags.get("age_skew")
    gender = tags.get("gender")
    tones = tags.get("tones") or []
    eras = tags.get("eras") or []

    def with_gender(q):
        """An actor cast as matriarchs should not be handed Neil from Heat.
        Without this the picks crossed gender freely."""
        if gender and gender != "any":
            return q.filter(
                or_(
                    Monologue.character_gender == gender,
                    Monologue.character_gender.in_(("any", "either gender")),
                )
            )
        return q

    def with_age(q):
        if age and age != "any":
            return q.filter(
                or_(
                    Monologue.character_age_range == age,
                    Monologue.character_age_range == "any",
                )
            )
        return q

    def narrow(q):
        return with_gender(with_age(q))

    # Era is a column on plays, not monologues, and the join is already in base.
    attempts = []
    if tones and eras:
        attempts.append(
            narrow(base.filter(Monologue.tone.in_(tones), Play.category.in_(eras)))
        )
    if tones:
        attempts.append(narrow(base.filter(Monologue.tone.in_(tones))))
    if eras:
        attempts.append(narrow(base.filter(Play.category.in_(eras))))
    attempts.append(narrow(base))
    # Gender survives one step longer than tone/era: it is the constraint an
    # actor would notice being ignored.
    attempts.append(with_gender(base))
    attempts.append(base)

    # Offset by user id so two actors in the same lane are not handed the same
    # three pieces, and over-fetch so deduping by character still fills the row.
    # Ordering by id alone put everyone on the lowest ids, which are all Romeo
    # and Juliet.
    # The keywords the model returned are the only part of the lane that says
    # anything a filter cannot: "grief", "verse", "class". Embedding them and
    # ordering by cosine distance is what makes these picks the lane rather
    # than simply the right tone and age bracket.
    vec = _lane_embedding(tags)

    spread = 40
    best: list[Monologue] = []
    for q in attempts:
        if vec is not None:
            # Ordered by meaning, then deduped by play in Python. DISTINCT ON
            # cannot be combined with this ordering (Postgres requires the
            # distinct column to lead the ORDER BY), and the earlier reason for
            # DISTINCT ON does not apply: ordering by id clustered rows by play,
            # ordering by distance does not, so a 40 row window is plenty.
            rows = q.order_by(
                Monologue.embedding_vector.cosine_distance(vec)
            ).limit(limit * 14).all()
            picked: list[Monologue] = []
            seen: set[int] = set()
            for m in rows:
                if m.play_id in seen:
                    continue
                seen.add(m.play_id)
                picked.append(m)
                if len(picked) >= limit:
                    break
        else:
            picked = (
                q.distinct(Monologue.play_id)
                .order_by(Monologue.play_id, Monologue.id)
                .offset(user_id % spread)
                .limit(limit)
                .all()
            )
        if len(picked) >= limit:
            return picked
        if len(picked) > len(best):
            best = list(picked)
    return best


def get_or_build_lane(db: Session, user_id: int) -> Optional[ActorLane]:
    """Cached read. Only calls the model when the credit set has changed."""
    credits = (
        db.query(ActorCredit)
        .filter(ActorCredit.user_id == user_id)
        .order_by(ActorCredit.sort_order, ActorCredit.id)
        .all()
    )
    if len(credits) < MIN_CREDITS:
        return None

    digest = credits_digest(credits)
    existing = db.query(ActorLane).filter(ActorLane.user_id == user_id).first()
    if existing and existing.credits_hash == digest:
        return existing

    read = read_lane(credits)
    if read is None:
        # Keep a previous good read rather than blanking the block on one bad
        # model call. It is stale, not wrong.
        return existing

    # Resolve the picks once, here, while the credits are already being read.
    # Doing it per request cost a pgvector scan (2 to 6 seconds) for an answer
    # that cannot change until the credits do.
    piece_ids = [m.id for m in pick_in_lane(db, read["tags"], limit=3, user_id=user_id)]

    if existing:
        existing.credits_hash = digest
        existing.line = read["line"]
        existing.blurb = read["blurb"]
        existing.tags = read["tags"]
        existing.piece_ids = piece_ids
    else:
        existing = ActorLane(
            user_id=user_id,
            credits_hash=digest,
            line=read["line"],
            blurb=read["blurb"],
            tags=read["tags"],
            piece_ids=piece_ids,
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return existing


def lane_pieces(db: Session, lane: ActorLane) -> list[Monologue]:
    """The cached picks, in their stored order.

    Falls back to a live query if the row predates the cache or a piece has
    since been deleted from the corpus, so an old row degrades rather than
    showing a short list.
    """
    ids = list(lane.piece_ids or [])
    if ids:
        rows = db.query(Monologue).filter(Monologue.id.in_(ids)).all()
        by_id = {m.id: m for m in rows}
        found = [by_id[i] for i in ids if i in by_id]
        if len(found) == len(ids):
            return found
    return pick_in_lane(db, lane.tags or {}, limit=3, user_id=lane.user_id)
