"""What the partner's voice is told, line by line.

The design sample (2026-10-23) was one prose prompt: a character sentence,
an acting note for the line, and the line:

    You are Mark, a man in his 40s and a would-be stand-up comic, talking to
    Esther in a park. Say the line suddenly gentle and sincere, soft and
    slower, the joke gone. Natural, human, not an announcer.

    <the line>

gemini-3.8-flash-tts speaks that prompt, all of it: on the first real run
"Oh honey ... I'm so sorry." came back as 23 seconds of Mark reading his own
character note aloud. Google's 3.8 guide says why: the text is a verbatim
transcript, and delivery goes in the turn's speech_metadata.style, which is
never spoken. It also says to keep names, age and gender out of the style,
because the voice carries those. So the pieces are kept, and placed where
the model takes them:

- the character reading picks the VOICE (voices.default_voices: gender, age,
  temperament), and its temperament is the style's colour on a line with no
  note of its own;
- the acting note, a few words of playable direction the reader writes for
  every spoken line, is the style;
- the delivery note printed on the cue ("MARK (continuing his act):") joins
  it, and ONLY that. scene_lines.stage_direction also carries business
  printed above the line ("They stop walking."), and a direction in a TTS
  style is an instruction to perform it. The reading's items still hold the
  two apart (scene_reader.items_to_voice_notes), so they are taken from
  there. The rehearsal screen keeps showing both; this is only what is said;
- the actor's own note for a part (Plus) is appended last;
- the text is the line, verbatim.

A scene read before acting notes existed, a scene whose reading was flagged,
and the house scenes ("Late", Hamlet) get their notes lazily: one model call
the first time partner audio is prepared, stored back on the scene's
original_snapshot under "partner_notes". That call returns notes only, keyed
by line number. It is never asked for, and never trusted with, the words: a
delivery note it hands back is kept only if it is printed in that line's
stage_direction.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from sqlalchemy.orm.attributes import flag_modified

from app.services.rehearsal.contract import RehearsalLine, same_character

logger = logging.getLogger(__name__)

# The lazy notes call: a judgement about tone, not a transcription, so the
# mini model is enough (it was 19 of 20 even on the harder job of reading a
# scene, scripts/eval_scene_reading.py). One call per scene, ever.
NOTES_MODEL = "gpt-5.4-mini"
# The actor's own note for a part (Plus). Long enough for "meaner, and he
# has been drinking", short enough that it cannot become a second script.
MAX_DIRECTOR_NOTE = 120
_SPACE = re.compile(r"\s+")


@dataclass(frozen=True)
class LineVoice:
    """Everything one partner line is synthesised from. Every field is part
    of the audio cache key (partner_audio.audio_key)."""
    text: str
    character: str = ""
    persona: str = ""   # the character's temperament, "playful, performative, needy"
    acting: str = ""    # "suddenly gentle and sincere, the joke gone"
    delivery: str = ""  # the printed cue note, "continuing his act"
    note: str = ""      # the actor's own note for this part (Plus)


def clean_note(note: str | None) -> str:
    """One line, no brackets the prompt could be closed with, capped."""
    s = _SPACE.sub(" ", (note or "").replace("\n", " ")).strip()
    s = s.strip("[](){}<>\"' ")
    return s[:MAX_DIRECTOR_NOTE].strip()


def _clause(s: str) -> str:
    return _SPACE.sub(" ", (s or "").strip()).strip(" .;,")


def character_colour(reading: dict | None) -> str:
    """The reading's temperament, as a style can carry it: a few words, no
    name, age or gender (the voice was cast on those)."""
    return _clause((reading or {}).get("temperament") or "")[:80]


def gemini_style(line: LineVoice) -> str:
    """speech_metadata.style for one line: how it is said, never words to say.

    The acting note and the cue's delivery note; the character's temperament
    only when the line has neither, so a note is never diluted by a general
    one ("playful" against "suddenly tender"); the actor's note last.
    """
    acting, cue = _clause(line.acting), _clause(line.delivery)
    # The notes model often folds the cue's note into its own ("continuing
    # his act, doubling down" for a line cued "continuing his act"); once is
    # enough.
    if cue and cue.casefold() in acting.casefold():
        cue = ""
    how = ", ".join(x for x in (acting, cue) if x) or _clause(line.persona)
    note = clean_note(line.note)
    if note:
        how = f"{how}; {note}" if how else note
    return how


def tagged_text(line: LineVoice) -> str:
    """The same direction for a vendor that takes a bracketed tag in the text
    (Inworld, ElevenLabs): "[gentle and sincere, continuing his act] the line"."""
    how = gemini_style(line)
    return f"[{how}] {line.text.strip()}" if how else line.text.strip()


# ---------------------------------------------------------------------------
# Notes for a scene
# ---------------------------------------------------------------------------

def _norm(s: str) -> str:
    from app.services.scene_reader import normalise
    return normalise(s or "").casefold()


def _align(lines: list[RehearsalLine], entries: list[dict]) -> dict[int, dict]:
    """Which entry belongs to which scene line. By position when the two
    agree line for line (the common case: nobody has edited the scene), else
    by speaker and words, each entry used once. A line edited since the notes
    were written matches nothing and gets none."""
    out: dict[int, dict] = {}
    if len(entries) == len(lines) and all(
        _norm(e.get("text", "")) == _norm(l.text) for e, l in zip(entries, lines)
    ):
        return {l.index: e for l, e in zip(lines, entries)}
    used: set[int] = set()
    for l in lines:
        want = _norm(l.text)
        for k, e in enumerate(entries):
            if k in used or _norm(e.get("text", "")) != want:
                continue
            if not same_character(e.get("character") or "", l.character):
                continue
            used.add(k)
            out[l.index] = e
            break
    return out


def _trusted_reading(scene) -> dict | None:
    snap = scene.original_snapshot if isinstance(getattr(scene, "original_snapshot", None), dict) else {}
    reading = snap.get("reading")
    if not isinstance(reading, dict) or reading.get("flagged") or not reading.get("items"):
        return None
    return reading


def _looks_like_delivery(direction: str | None) -> str:
    """With no reading and no notes, the one stage_direction shape that is
    safe to say aloud: a short lowercase parenthetical ("softly", "not
    looking at him"). "They stop walking." is a sentence of business and is
    dropped. Only used when everything else has failed."""
    d = re.sub(r"^[\[\(]|[\]\)]$", "", (direction or "").strip()).strip()
    if not d or len(d.split()) > 5 or not d[0].islower() or ";" in d:
        return ""
    return d


@dataclass
class SceneVoicing:
    """The notes for every line of a scene, and the character readings."""
    characters: list[dict]
    acting: dict[int, str]
    delivery: dict[int, str]

    def line_voice(self, line: RehearsalLine, note: str = "") -> LineVoice:
        from app.services.rehearsal.voices import reading_for
        return LineVoice(
            text=line.text,
            character=line.character,
            persona=character_colour(reading_for(self.characters, line.character)),
            acting=self.acting.get(line.index, ""),
            delivery=self.delivery.get(line.index, ""),
            note=clean_note(note),
        )


def scene_voicing(db, scene, lines: list[RehearsalLine], client=None, enrich: bool = True) -> SceneVoicing:
    """Notes for every line, from the reading, else the stored lazy notes,
    else one model call now (stored on the scene for every later open).

    `client` is an OpenAI client; None builds one from settings. With
    enrich=False (or no key, or the call failing) the scene is voiced with
    whatever it has, and nothing is stored, so the next open tries again.
    """
    reading = _trusted_reading(scene)
    snap = scene.original_snapshot if isinstance(scene.original_snapshot, dict) else {}
    stored = snap.get("partner_notes") if isinstance(snap.get("partner_notes"), dict) else None

    characters = list((reading or {}).get("characters") or (stored or {}).get("characters") or [])
    acting: dict[int, str] = {}
    delivery: dict[int, str] = {}
    from_reading: dict[int, dict] = {}
    if reading:
        from app.services.scene_reader import items_to_voice_notes
        from_reading = _align(lines, items_to_voice_notes(reading["items"]))
        for i, e in from_reading.items():
            delivery[i] = e.get("delivery") or ""
            if "acting" in e:
                acting[i] = e["acting"] or ""
    from_store = _align(lines, list(stored.get("lines") or [])) if stored else {}
    for i, e in from_store.items():
        acting.setdefault(i, e.get("acting") or "")
        delivery.setdefault(i, e.get("delivery") or "")

    missing = [l for l in lines if l.index not in acting]
    if missing and enrich:
        fresh = _enrich(scene, lines, client, characters)
        if fresh is not None:
            notes, fresh_characters = fresh
            if not characters:
                characters = fresh_characters
            for l in lines:
                n = notes.get(l.index)
                if n is None:
                    continue
                acting.setdefault(l.index, n["acting"])
                delivery.setdefault(l.index, n["delivery"])
            _store(db, scene, lines, notes, fresh_characters)

    for l in lines:
        if l.index not in delivery:
            delivery[l.index] = _looks_like_delivery(l.direction)
    return SceneVoicing(characters=characters, acting=acting, delivery=delivery)


# ---------------------------------------------------------------------------
# The lazy call
# ---------------------------------------------------------------------------

NOTES_SCHEMA = {
    "name": "partner_notes",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["lines", "characters"],
        "properties": {
            "lines": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["n", "acting", "delivery"],
                    "properties": {
                        "n": {"type": "integer"},
                        "acting": {"type": "string"},
                        "delivery": {"type": "string"},
                    },
                },
            },
            "characters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "gender", "age_range", "relationship", "wants", "temperament"],
                    "properties": {
                        "name": {"type": "string"},
                        "gender": {"type": "string", "enum": ["female", "male", "nonbinary", "unknown"]},
                        "age_range": {"type": "string"},
                        "relationship": {"type": "string"},
                        "wants": {"type": "string"},
                        "temperament": {"type": "string"},
                    },
                },
            },
        },
    },
}

NOTES_PROMPT = """You are a director giving notes to the actor who will voice the other parts of a scene. You never rewrite the scene and you never quote it back.

You get the scene as numbered lines: the speaker, any note printed with the line (in brackets), and the words.

For every line return:
- n: its number.
- acting: 3 to 12 words of playable direction for how the line is said, such as "teasing and affectionate, light" or "suddenly gentle and sincere, the joke gone". Read it from what the character wants and what has just happened. Never words from the line.
- delivery: the part of the printed note that says how the words are spoken ("softly", "continuing his act", "to Esther"), copied exactly. Leave out anything that is action or business ("They stop walking.", "She crosses to the door."). "" when the note is all business or there is none.

Also return characters: one entry for each character who speaks. gender is female, male, nonbinary or unknown. age_range is like "30s" or "teens", "" if the scene gives no sign. relationship is who they are to the others here. wants is what they want in this scene. temperament is a few words. Use "" for anything the scene does not show."""


def _notes_messages(scene, lines: list[RehearsalLine]) -> list[dict]:
    rows = []
    for l in lines:
        note = f" [{l.direction}]" if l.direction else ""
        rows.append(f"{l.index}. {l.character}{note}: {l.text}")
    title = getattr(scene, "title", "") or ""
    setting = getattr(scene, "setting", "") or ""
    head = f"Scene: {title}" + (f" ({setting})" if setting else "")
    return [
        {"role": "system", "content": NOTES_PROMPT},
        {"role": "user", "content": head + "\n\n" + "\n".join(rows)},
    ]


def _openai_client():
    from app.core.config import settings
    if not settings.openai_api_key:
        return None
    from openai import OpenAI
    return OpenAI(api_key=settings.openai_api_key)


def _enrich(scene, lines: list[RehearsalLine], client, known_characters) -> tuple[dict[int, dict], list[dict]] | None:
    """One call: {line index: {"acting", "delivery"}} and the character
    readings. None when there is no model or it fails; the scene is voiced
    without notes and the next open tries again."""
    if not lines:
        return None
    client = client or _openai_client()
    if client is None:
        return None
    from app.services.scene_reader import _model_params
    try:
        response = client.chat.completions.create(
            model=NOTES_MODEL,
            messages=_notes_messages(scene, lines),
            response_format={"type": "json_schema", "json_schema": NOTES_SCHEMA},
            # The first actor to open the scene is waiting on this.
            timeout=45,
            **_model_params(NOTES_MODEL),
        )
        reply = json.loads(response.choices[0].message.content or "{}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("partner notes for scene %s failed: %s", getattr(scene, "id", "?"), exc)
        return None
    by_index = {l.index: l for l in lines}
    notes: dict[int, dict] = {}
    for item in reply.get("lines") or []:
        if not isinstance(item, dict):
            continue
        line = by_index.get(item.get("n"))
        if line is None:
            continue
        acting = _clause(str(item.get("acting") or ""))
        # Twelve words was asked for; a paragraph is not a note.
        acting = " ".join(acting.split()[:16])
        delivery = _clause(str(item.get("delivery") or ""))
        # The one thing the model may copy, and it must be printed there.
        if delivery and _norm(delivery) not in _norm(line.direction or ""):
            delivery = ""
        notes[line.index] = {"acting": acting, "delivery": delivery}
    characters = [c for c in reply.get("characters") or [] if isinstance(c, dict)]
    return notes, characters


def _store(db, scene, lines: list[RehearsalLine], notes: dict[int, dict], characters: list[dict]) -> None:
    """Keep the notes on the scene, with the words they were written for, so
    an edited line is noticed (it no longer matches) rather than voiced with
    another line's note."""
    record = {
        "model": NOTES_MODEL,
        "lines": [
            {"character": l.character, "text": l.text, **notes[l.index]}
            for l in lines if l.index in notes
        ],
        "characters": characters,
    }
    snap = dict(scene.original_snapshot) if isinstance(scene.original_snapshot, dict) else None
    if snap is None:
        # A scene with no snapshot (the house scenes, old uploads) gets a whole
        # one, in the shape "Reset to original" reads, of the lines as they
        # are now; a half snapshot would break that reset.
        snap = {
            "character_1_name": scene.character_1_name,
            "character_2_name": scene.character_2_name,
            "description": getattr(scene, "description", None),
            "lines": [
                {"line_order": l.index, "character_name": l.character, "text": l.text, "stage_direction": l.direction}
                for l in lines
            ],
        }
    snap["partner_notes"] = record
    scene.original_snapshot = snap
    try:
        flag_modified(scene, "original_snapshot")
    except Exception:  # noqa: BLE001  (a plain object in a test)
        pass
    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not store partner notes for scene %s: %s", getattr(scene, "id", "?"), exc)
        db.rollback()
