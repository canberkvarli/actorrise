"""The model reads each scene; the page decides whether it read it right.

Until 2026-10-23 every user scene was split into lines by the rules in
script_parser.parse_dialogue, and rules only know the shapes somebody thought
to write down. "Almost a Therapist" (user script 132, a Word file) showed what
that costs: "MARK (continuing his act):" did not look like a cue, so Mark's
routine was handed to Esther; "They stop walking." was spoken by Mark; the
row of dots under the last line went to Esther with her "I said no."

So a model now reads every scene. It gets the scene's own text, and the rule
parser's attempt as a hint, and returns the scene as an ordered list of items:
a spoken line (who, the words, and any delivery note on the cue), or a
direction. It also writes a short reading of each character, and a few words
of acting note on every spoken line ("teasing and affectionate, light"), for
the partner's voice (services/rehearsal/delivery). The notes are the model's
own words and are never checked against the page; the lines are.

A model can retype, and an actor rehearsing words that are not in their script
is the one failure that cannot be shrugged off. So nothing it returns is taken
on trust. check_reading() finds every item in the source, in order, after
evening out whitespace, quote marks and dashes, and makes sure nothing between
the items was left out except the cues it turned into structure. A reading
that fails is sent back once with its problems named. A reading that fails
twice is not used: the scene keeps the rule parser's lines and is flagged, so
the shelf can say so.

What lands in scene_lines follows the shape rehearsal already reads: every row
is a spoken line, and a direction rides on the stage_direction of the line it
comes before (the scene's last line, if nothing follows it). The rehearsal
screen prints stage_direction between the cue and the words, never speaks it,
and never counts it as the actor's. The items themselves, and the character
readings, go on the scene's original_snapshot under "reading", which needs no
schema change.

The model is a single constant, READER_MODEL, chosen by
scripts/eval_scene_reading.py rather than by guess.
"""

from __future__ import annotations

import json
import re
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Sequence, Tuple

# Chosen by scripts/eval_scene_reading.py on 2026-10-23: the cheapest model
# with every run perfect (13 of 13; gpt-5.5 was 17 of 17 at about 1.7x the
# cost; gpt-5.4-mini 19 of 20, its miss an action line read as June speaking;
# gpt-4o-mini 10 of 16). Run the eval again before changing it.
READER_MODEL = "gpt-5.4"

# Scenes are read side by side, a few at a time. A play has twenty scenes and
# a call takes tens of seconds; one after another would keep an actor waiting
# minutes for a script they uploaded to rehearse tonight.
READER_WORKERS = 4

# Past this a scene is longer than one reply can carry back verbatim. It keeps
# the rule parser's lines and is flagged, rather than coming back cut short.
MAX_SCENE_CHARS = 60_000

# How long a hint line can be. The hint is there to show the shape, not to be
# a second copy of the text.
_HINT_LINE_CHARS = 160


# ---------------------------------------------------------------------------
# What the model is asked for
# ---------------------------------------------------------------------------

SCHEMA = {
    "name": "scene_reading",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["items", "characters"],
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["kind", "character", "text", "delivery", "acting"],
                    "properties": {
                        "kind": {"type": "string", "enum": ["line", "direction"]},
                        "character": {"type": "string"},
                        "text": {"type": "string"},
                        "delivery": {"type": "string"},
                        # The reader's own note on how to play the line, for
                        # the partner's voice. Not source words, so the
                        # grounding check never looks at it.
                        "acting": {"type": "string"},
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

SYSTEM_PROMPT = """You read one scene of a script and return its structure. You never rewrite it.

Return the scene, in order, as items:
- kind "line": words a character says out loud.
- kind "direction": anything that is not said: stage directions, action, business, a parenthetical that stands on its own or interrupts a speech.

Rules:
1. Copy text exactly as printed, character for character: the same words, spelling, punctuation, quotation marks and capitals, typos included. Never correct, summarise, shorten or tidy. A speech printed over several lines is joined with single spaces.
2. A speaker cue is structure, not text. "MARK:", "ESTHER.", "HAMLET." on a line of its own, "LEO (CONT'D)" all become the character field. Write the name as the cue prints it, without its punctuation and without extensions such as (CONT'D), (V.O.), (O.S.).
3. delivery is a note on the cue or at the very start of the speech: "MARK (continuing his act): ...", "MAYA, quietly: ...", a screenplay parenthetical on its own line under the cue such as "(beat)", "JANE: (softly) Hi." Put the note's words, without brackets, in delivery. Otherwise delivery is "".
4. A parenthetical or bracketed direction in the middle of a speech, such as "I almost did. (beat) Then I didn't.", splits it: a line, a direction, a line, same character.
5. A paragraph with no cue is either a direction or more of the same speech. If it narrates what someone does ("They stop walking.", "Mark continues with his act.") it is a direction. If it is the last speaker still talking (it says I or you, it answers, it carries on a routine or a quotation) it joins that speaker's line. A speech runs from its cue to the next cue or the next direction.
6. A paragraph of action is one direction item, whole, with every word in it, including the names it mentions ("JUNE (40s) stirs a coffee." keeps JUNE and the (40s)). Never split a paragraph into several directions.
7. Leave out headings (act, scene and episode numbers, sluglines such as INT. KITCHEN - NIGHT, a title line at the very top naming the film, show, play or scene such as "The Long Winter - kitchen scene"), page numbers, and rows of dots or rules. Leave out nothing else: every spoken sentence and every direction appears in exactly one item.
8. A line's text is only the words spoken: no cue, and no bracketed note. A direction item has character "", delivery "" and acting "".
9. acting is your own note on how the line is played, for the actor who will voice it: 3 to 12 words of playable direction, such as "teasing and affectionate, light" or "suddenly gentle and sincere, the joke gone". It is a note, never words from the line, and it never changes the text. Read it from what the character wants and what has just happened.

Also return characters: one entry for each character who speaks, a short reading for the actor who will voice them, from this scene only. gender is female, male, nonbinary or unknown. age_range is like "30s" or "teens", "" if the scene gives no sign. relationship is who they are to the others here. wants is what they want in this scene. temperament is a few words. Use "" for anything the scene does not show."""


def _hint(lines: Sequence[Dict]) -> str:
    """The rule parser's attempt, one line per speech, as a hint and no more."""
    out = []
    for line in lines or ():
        text = (line.get("text") or "").strip()
        if len(text) > _HINT_LINE_CHARS:
            text = text[:_HINT_LINE_CHARS] + " …"
        note = f" ({line['stage_direction']})" if line.get("stage_direction") else ""
        out.append(f"{line.get('character')}{note}: {text}")
    return "\n".join(out) or "(none)"


def _messages(source: str, hint_lines: Sequence[Dict]) -> List[Dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "The scene, exactly as printed:\n<<<\n" + source.strip() + "\n>>>\n\n"
                "A rule-based parser's attempt at the same scene. It may be wrong; it is "
                "only a hint:\n" + _hint(hint_lines)
            ),
        },
    ]


# ---------------------------------------------------------------------------
# The grounding check
# ---------------------------------------------------------------------------

_DOUBLE_QUOTES = re.compile(r"[\"“”„‟«»]")
_SINGLE_QUOTES = re.compile(r"[‘’‚‛ʼ`´]")
_DASHES = re.compile(r"\s*[‐‑‒–—―\-]+\s*")
_ELLIPSIS = re.compile(r"\s*(?:…|\.\.\.)\s*")
_MARKUP = re.compile(r"[\x02\x03_]")
_SPACE = re.compile(r"\s+")

# Lines a reader is told to leave out. Only ever used to excuse text between
# items; an item is always looked for in the full source.
_HEADING_LINE = re.compile(
    r"^\s*(?:\d+\s+)?(?:(?:ACT|SCENE|EPISODE|PROLOGUE|EPILOGUE|FADE (?:IN|OUT)|CUT TO|"
    r"DISSOLVE TO|THE END|END OF)\b|SC\.|INT[\./]|EXT[\./]|I/E\b).{0,100}$",
    re.IGNORECASE,
)
_HONORIFICS = re.compile(
    r"\b(?:Dr|Mr|Mrs|Ms|Miss|Rev|Sir|Lady|Lord|Capt|Col|Gen|Maj|Sgt|Lt|Prof|St|Fr)\b\.?",
    re.IGNORECASE,
)


def normalise(text: str) -> str:
    """Text as it is compared: the words and punctuation, not the typography.

    A Word file prints ’ and “, a model may write ' and ". A dash may come
    back with or without spaces round it, an ellipsis as one glyph or three
    full stops. None of that changes a word, so none of it may fail a reading.
    Double quotation marks are dropped outright: they are not words, and a
    model that loses the one closing a routine has not changed what is said.
    """
    s = _MARKUP.sub("", text or "")
    s = _DOUBLE_QUOTES.sub("", s)
    s = _SINGLE_QUOTES.sub("'", s)
    s = _ELLIPSIS.sub(" ... ", s)
    s = _DASHES.sub(" - ", s)
    return _SPACE.sub(" ", s).strip()


def _strip_brackets(text: str) -> str:
    s = (text or "").strip()
    while len(s) >= 2 and s[0] + s[-1] in ("()", "[]"):
        s = s[1:-1].strip()
    return s.strip("_ ").strip()


# A sentence ends in one of these; a title does not.
_SENTENCE_END = re.compile(r"[.!?…\"'”’)\]]\s*$")


def _is_title_line(raw: str, cast_keys: set) -> bool:
    """A line at the top of a scene that names it rather than plays it: "The
    Long Winter - kitchen scene", "GOOD WILL HUNTING (1997)". A teacher typing
    sides up from a film heads each one like that (The Actors Workshop,
    2026-10-27), and the reader had to keep it, so it rode on the first line as
    a stage direction. Short, no sentence in it, and not a speaker's cue."""
    s = raw.strip()
    if not s or len(s) > 80 or _SENTENCE_END.search(s) or _SENTENCE_BREAK.search(s):
        return False
    key = _name_key(s.split(":")[0])
    return key not in cast_keys and not any(key.startswith(c + " ") for c in cast_keys)


_SENTENCE_BREAK = re.compile(r"[.!?]\s+[A-Z]")


def _title_rows(raw_lines: Sequence[str], cast_keys: set) -> set:
    """Indexes of the title lines at the top of a scene: each a paragraph of
    one line (a blank line or the end after it, so a hard-wrapped line of
    action is never one), before the first line that is anything else."""
    rows = set()
    if not cast_keys:
        return rows
    for i, raw in enumerate(raw_lines):
        if not raw.strip():
            continue
        alone = i + 1 >= len(raw_lines) or not raw_lines[i + 1].strip()
        if not (alone and _is_title_line(raw, cast_keys)):
            break
        rows.add(i)
    return rows


def _normalised_source(source: str, cast: Sequence[str] = ()) -> Tuple[str, List[Tuple[int, int]], set]:
    """The source normalised line by line: the text, where its heading lines
    sit, and where each printed line begins. `cast` (the scene's speakers)
    tells a title line at the top from the first cue."""
    parts: List[str] = []
    headings: List[Tuple[int, int]] = []
    starts = set()
    pos = 0
    raw_lines = (source or "").split("\n")
    titles = _title_rows(raw_lines, {_name_key(c) for c in cast if _name_key(c)})
    for i, raw in enumerate(raw_lines):
        n = normalise(raw)
        if not n:
            continue
        if parts:
            pos += 1  # the joining space
        starts.add(pos)
        if i in titles or (_HEADING_LINE.match(raw) and len(raw.strip()) < 100):
            headings.append((pos, pos + len(n)))
        parts.append(n)
        pos += len(n)
    return " ".join(parts), headings, starts


def _name_key(name: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", (name or "").upper()).strip()


def _name_pattern(names: Sequence[str]) -> Optional[re.Pattern]:
    keys = sorted({_name_key(n) for n in names if _name_key(n)}, key=len, reverse=True)
    if not keys:
        return None
    alts = [r"[\s.'’\-]+".join(re.escape(w) for w in k.split()) for k in keys]
    return re.compile(r"(?<![A-Za-z])(?:" + "|".join(alts) + r")(?![A-Za-z])", re.IGNORECASE)


def _note_key(note: str) -> str:
    """A delivery note as it is looked for: no brackets, no closing colon."""
    return normalise(_strip_brackets(note)).rstrip(":.,; ").strip()


# A cue the reading never named: a shouted name at the head of a printed line.
_SHOUTED_CUE = re.compile(r"[A-Z][A-Z'’\-]+(?:[ .]{1,2}[A-Z][A-Z'’\-]+){0,2}(?![a-z])")
_COLON_AFTER = re.compile(r"\s*(?:\([^()]*\))?\s*:")


def _cues_in(gap: str, offset: int, names: Optional[re.Pattern], line_starts: set) -> List[Tuple[int, int, str]]:
    """The speaker cues in a gap, as (start, end, name).

    A name only counts as a cue where a cue can stand: at the head of a
    printed line, or with a colon after it ("MARK (continuing his act):").
    gpt-5.4-mini once read the action "JUNE (40s) stirs a coffee she has no
    intention of drinking." as June saying "stirs a coffee she has no
    intention of drinking." with the delivery "40s". JUNE there is in the
    middle of a sentence, so it is no cue, and the reading fails.
    """
    found: List[Tuple[int, int, str]] = []
    if names is not None:
        for m in names.finditer(gap):
            if offset + m.start() in line_starts or _COLON_AFTER.match(gap, m.end()):
                found.append((m.start(), m.end(), _name_key(m.group(0))))
    for start in sorted(p - offset for p in line_starts if offset <= p < offset + len(gap)):
        if any(a <= start < b for a, b, _ in found):
            continue
        m = _SHOUTED_CUE.match(gap, start)
        if m and not _CUE_EXTENSIONS.match(m.group(0)) and len(m.group(0)) >= 2:
            found.append((m.start(), m.end(), _name_key(m.group(0))))
    return sorted(found)


def _blank(text: str, spans) -> str:
    chars = list(text)
    for a, b in spans:
        for k in range(max(a, 0), min(b, len(chars))):
            chars[k] = " "
    return "".join(chars)


def _residue(gap: str, cues: Sequence[Tuple[int, int, str]], delivery: str) -> str:
    """What is left between two items once the material allowed there is taken out.

    In front of a spoken line that is its cue: the name, its extension
    ("CONT'D"), a delivery note. In front of a direction, or after the last
    item, there are no cues, so nothing but headings and punctuation is
    allowed, and a direction that lost a name ("JUNE (40s) stirs a coffee"
    read as "(40s) stirs a coffee") is caught.
    """
    r = _blank(gap, [(a, b) for a, b, _ in cues])
    if delivery:
        r = re.sub(re.escape(_note_key(delivery)), " ", r, count=1, flags=re.IGNORECASE)
    if cues:
        r = _HONORIFICS.sub(" ", r)
    r = " ".join(
        t for t in r.split() if not _CUE_EXTENSIONS.match(re.sub(r"[()\[\]:.,]", "", t))
    )
    return _SPACE.sub(" ", re.sub(r"[^A-Za-z]+", " ", r)).strip()


# A bracket inside a spoken line that is a note to the actor, not words:
# "(beat)", "(quietly)", "[_Aside._]". Only the unmistakable ones: verse puts
# spoken clauses in brackets too, "Turned her obedience (which is due to me)
# / To stubborn harshness", and that is the playwright (see
# script_parser._extract_stage_direction). So a bracket counts as a note when
# it is one or two lowercase words, a word every script uses for one, or set
# in italic underscores the way Gutenberg marks a direction.
_INLINE_NOTE = re.compile(r"[\(\[]([^()\[\]]{1,60})[\)\]]")
_NOTE_WORDS = {"beat", "a beat", "pause", "a pause", "aside", "laughs", "sighs", "beat."}


def _inline_note(text: str) -> Optional[str]:
    for m in _INLINE_NOTE.finditer(text or ""):
        raw = m.group(1).strip()
        inner = raw.strip("_ ").strip()
        if not inner:
            continue
        if raw.startswith("_") or inner.casefold().rstrip(".") in _NOTE_WORDS:
            return m.group(0)
        if len(inner.split()) <= 2 and inner[0].islower():
            return m.group(0)
    return None


def _snippet(text: str, n: int = 60) -> str:
    text = _SPACE.sub(" ", text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


_CUE_EXTENSIONS = re.compile(
    r"^(?:CONT'?[’']?D|CONTD|MORE|V\.?O|O\.?S|O\.?C|CONTINUED)\.?$", re.IGNORECASE
)


def check_reading(source: str, items: Sequence[Dict], cast: Sequence[str] = ()) -> List[str]:
    """Every problem with a reading, in plain words. An empty list is a pass.

    The reading passes when:
      - every item's text is in the source, in the order given, with no word
        changed (whitespace, quote marks and dashes evened out first);
      - nothing between two items was dropped: what lies between them is only
        speaker cues, a line's delivery note, headings and punctuation;
      - each line's speaker is the one the source cues for it, and a line with
        no cue in front of it keeps the speaker of the line before;
      - every delivery note is printed in front of its line.

    `cast` is any names known to be cues besides the reading's own speakers
    (the rule parser's), so a speaker the model left out entirely is still
    recognised as a cue in the source.

    Pure: no model, no database. It is the whole of the trust placed in what a
    model hands back.
    """
    problems: List[str] = []
    if not items:
        return ["the reading is empty"]

    speakers = [i.get("character") or "" for i in items if i.get("kind") == "line"]
    text, headings, line_starts = _normalised_source(source, list(speakers) + list(cast or ()))

    names = _name_pattern(list(speakers) + list(cast or ()))

    def masked(start: int, end: int) -> str:
        """The gap, with heading lines blanked out."""
        chunk = list(text[start:end])
        for h0, h1 in headings:
            for k in range(max(h0, start), min(h1, end)):
                chunk[k - start] = " "
        return "".join(chunk)

    cursor = 0
    previous_speaker: Optional[str] = None
    for n, item in enumerate(items, start=1):
        kind = item.get("kind")
        body = item.get("text") or ""
        if kind not in ("line", "direction"):
            problems.append(f"item {n} has an unknown kind {kind!r}")
            continue
        if kind == "line" and not _name_key(item.get("character")):
            problems.append(f"item {n} is a line with no character: “{_snippet(body)}”")
        needle = normalise(body)
        if kind == "direction":
            needle = normalise(_strip_brackets(body))
        if not needle:
            problems.append(f"item {n} is empty")
            continue

        at = text.find(needle, cursor)
        if at < 0:
            elsewhere = text.find(needle)
            if elsewhere >= 0:
                problems.append(f"item {n} is out of order or repeated: “{_snippet(body)}”")
            else:
                problems.append(f"item {n} is not in the source word for word: “{_snippet(body)}”")
            continue

        gap = masked(cursor, at)
        delivery = (item.get("delivery") or "").strip() if kind == "line" else ""
        if delivery and _note_key(delivery).casefold() not in gap.casefold():
            problems.append(
                f"item {n}'s delivery “{_snippet(delivery)}” is not printed in front of its line"
            )
        # Only a spoken line has a cue in front of it.
        cues = _cues_in(gap, cursor, names, line_starts) if kind == "line" else []
        left = _residue(gap, cues, delivery)
        if left:
            problems.append(f"text before item {n} was left out: “{_snippet(left)}”")

        if kind == "line":
            note = _inline_note(body)
            if note:
                problems.append(
                    f"item {n} keeps the direction “{note}” inside its spoken words; "
                    "a note at the start is its delivery, one in the middle splits the line"
                )
            speaker = _name_key(item.get("character"))
            if cues:
                cued = cues[-1][2]
                if cued != speaker and cued not in speaker.split() and speaker not in cued.split():
                    problems.append(f"item {n} is cued {cued} in the source but given to {speaker}")
            elif previous_speaker is None:
                problems.append(f"item {n}, the first line, has no cue in front of it: “{_snippet(body)}”")
            elif speaker != previous_speaker:
                problems.append(
                    f"item {n} changes speaker to {speaker} with no cue in front of it: “{_snippet(body)}”"
                )
            previous_speaker = speaker
        cursor = at + len(needle)

    tail = _residue(masked(cursor, len(text)), [], "")
    if tail:
        problems.append(f"text after the last item was left out: “{_snippet(tail)}”")

    for name in sorted({_name_key(c) for c in speakers if _name_key(c)}):
        pattern = _name_pattern([name])
        if pattern is not None and not pattern.search(text):
            problems.append(f"{name} is not a name printed in the scene")
    return problems


# ---------------------------------------------------------------------------
# From items to the lines rehearsal reads
# ---------------------------------------------------------------------------

def items_to_lines(items: Sequence[Dict]) -> List[Dict]:
    """The shape scene_lines has always had: spoken lines, directions riding on them.

    A direction goes above the line that follows it, in front of that line's
    own delivery note, which is where the rehearsal screen prints it: between
    the cue and the words. One after the last line closes the scene on it.
    Nothing is spoken that is not a line's text, so a direction can never
    reach the partner's voice as words or the actor's word count.

    The boundaries are made canonical here rather than left to the model's
    mood, because the eval showed every model splitting the same correct
    reading different ways: Mark's routine and the two paragraphs he carries
    on with as one line or three, an action paragraph as one direction or
    one per sentence. A speech runs from its cue to the next cue or direction,
    so consecutive pieces of one speaker with nothing between them are one
    line (unless the second has a note of its own), and directions printed
    back to back are one direction, the way the page sets them.
    """
    return [
        {"character": l["character"], "text": l["text"], "stage_direction": l["stage_direction"]}
        for l in _grouped(items)
    ]


def items_to_voice_notes(items: Sequence[Dict]) -> List[Dict]:
    """The same lines as items_to_lines, with what the partner's voice may use.

    stage_direction on a scene line is two things glued together: business
    printed above the line ("They stop walking.") and the delivery note on
    its cue ("continuing his act"). The screen shows both. Only the second is
    about how the words are said, and a direction handed to a TTS model is
    read as an instruction to perform it, so the voice needs them apart. The
    items still have them apart, and this keeps them so: {"character",
    "text", "delivery", "acting"}, one per line, in the same grouping, so the
    nth entry here is the nth line items_to_lines makes.

    `acting` is present only when the reading carried acting notes (readings
    from before 2026-10-23 do not), so a caller can tell "the reader wrote no
    note" from "nobody asked the reader".
    """
    out = []
    for l in _grouped(items):
        entry = {"character": l["character"], "text": l["text"], "delivery": l["delivery"]}
        if l["acting"] is not None:
            entry["acting"] = l["acting"]
        out.append(entry)
    return out


def _grouped(items: Sequence[Dict]) -> List[Dict]:
    """items_to_lines' work, keeping the delivery note and acting note apart
    from the directions that ride on stage_direction."""
    lines: List[Dict] = []
    waiting: List[str] = []
    for item in items:
        if item.get("kind") == "direction":
            d = _SPACE.sub(" ", _strip_brackets(item.get("text") or "")).strip()
            if d:
                waiting.append(d)
            continue
        text = _SPACE.sub(" ", item.get("text") or "").strip()
        if not text:
            continue
        character = _SPACE.sub(" ", item.get("character") or "").strip().upper()
        delivery = _SPACE.sub(" ", _strip_brackets(item.get("delivery") or "")).strip()
        if _CUE_EXTENSIONS.match(delivery):
            delivery = ""  # "(CONT'D)" says the speech goes on; it is no note to the actor
        acting = _SPACE.sub(" ", item["acting"]).strip() if isinstance(item.get("acting"), str) else None
        if lines and not waiting and not delivery and lines[-1]["character"] == character:
            lines[-1]["text"] += " " + text
            if not lines[-1]["acting"] and acting:
                lines[-1]["acting"] = acting
            continue
        notes = [_join_directions(waiting)] if waiting else []
        if delivery:
            notes.append(delivery)
        waiting = []
        lines.append({
            "character": character,
            "text": text,
            "stage_direction": "; ".join(notes) or None,
            "delivery": delivery,
            "acting": acting,
        })
    if waiting and lines:
        last = lines[-1]
        last["stage_direction"] = "; ".join(
            ([last["stage_direction"]] if last.get("stage_direction") else []) + [_join_directions(waiting)]
        )
    return lines


def _join_directions(parts: Sequence[str]) -> str:
    """Directions set back to back, as one: sentences run on, notes take a semicolon."""
    out = ""
    for p in parts:
        if not out:
            out = p
        elif out[-1] in ".!?":
            out += " " + p
        else:
            out += "; " + p
    return out


def lines_to_items(lines: Sequence[Dict]) -> List[Dict]:
    """The rule parser's lines written as items, for a scene the model did not read."""
    return [
        {
            "kind": "line",
            "character": l.get("character") or "",
            "text": l.get("text") or "",
            "delivery": l.get("stage_direction") or "",
        }
        # No "acting": the rules wrote no notes. And this "delivery" is the
        # whole stage_direction, business included, so it is never handed to
        # a voice (services/rehearsal/delivery ignores a flagged reading).
        for l in lines
    ]


# ---------------------------------------------------------------------------
# The call
# ---------------------------------------------------------------------------

def _model_params(model: str) -> Dict:
    """What each family accepts. The gpt-5 line reasons and takes no temperature."""
    if model.startswith(("gpt-5", "o3", "o4")):
        return {"reasoning_effort": "low", "max_completion_tokens": 32000}
    return {"temperature": 0, "max_tokens": 16000}


def _call_model(client, model: str, messages: List[Dict]) -> Tuple[Dict, Dict]:
    """One structured call. Returns (parsed reply, token usage)."""
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_schema", "json_schema": SCHEMA},
        # The SDK default is ten minutes with two silent retries; an upload
        # waiting on one stuck scene that long reads as a broken upload. Two
        # minutes, then the scene falls back to the rule lines, flagged.
        timeout=120,
        **_model_params(model),
    )
    content = response.choices[0].message.content or "{}"
    usage = getattr(response, "usage", None)
    tokens = {
        "input": getattr(usage, "prompt_tokens", 0) or 0,
        "output": getattr(usage, "completion_tokens", 0) or 0,
    }
    return json.loads(content), tokens


def read_scene(source: str, hint_lines: Sequence[Dict], client,
               model: str = READER_MODEL) -> Dict:
    """Read one scene. Never raises; a reading that cannot be trusted says so.

    Returns {"lines", "items", "characters", "flagged", "problems", "model",
    "attempts", "usage"}. When flagged, "lines" is the rule parser's
    hint_lines untouched: a scene is never left worse than the rules made it.
    """
    usage = {"input": 0, "output": 0}
    fallback = {
        "lines": [dict(l) for l in hint_lines or ()],
        "items": lines_to_items(hint_lines or ()),
        "characters": [],
        "flagged": True,
        "model": model,
        "attempts": 0,
        "usage": usage,
    }
    if client is None:
        return dict(fallback, problems=["no model to read with"])
    if len(source or "") > MAX_SCENE_CHARS:
        return dict(fallback, problems=[f"the scene is longer than {MAX_SCENE_CHARS} characters"])

    messages = _messages(source, hint_lines)
    problems: List[str] = []
    characters: List[Dict] = []
    rejected: List[Dict] = []
    for attempt in (1, 2):
        try:
            reply, tokens = _call_model(client, model, messages)
        except Exception as e:  # network, quota, a reply that is not JSON
            problems = [f"the model could not be read: {type(e).__name__}: {str(e)[:200]}"]
            fallback["attempts"] = attempt
            break
        usage["input"] += tokens["input"]
        usage["output"] += tokens["output"]
        items = [i for i in (reply.get("items") or []) if isinstance(i, dict)]
        characters = [c for c in (reply.get("characters") or []) if isinstance(c, dict)] or characters
        problems = check_reading(source, items, cast=_rank_cast(hint_lines or ()))
        if not problems:
            items = _drop_title_directions(source, items, _rank_cast(hint_lines or ()))
            return {
                "lines": items_to_lines(items),
                "items": items,
                "characters": characters,
                "flagged": False,
                "problems": [],
                "model": model,
                "attempts": attempt,
                "usage": usage,
            }
        fallback["attempts"] = attempt
        rejected = items
        messages = messages + [
            {"role": "assistant", "content": json.dumps(reply, ensure_ascii=False)},
            {
                "role": "user",
                "content": (
                    "That reading does not match the page. Problems:\n- "
                    + "\n- ".join(problems[:20])
                    + "\n\nRead the scene again from the start and return the whole reading. "
                    "Copy every word exactly as printed and leave nothing out."
                ),
            },
        ]
    # The model's view of the characters is a judgement, not the text, so it
    # is kept even when its lines are not. The rejected items go back too, for
    # the eval and the re-read script to show; nothing stores them.
    return dict(fallback, characters=characters, problems=problems, rejected=rejected)


def _drop_title_directions(source: str, items: List[Dict], cast: Sequence[str]) -> List[Dict]:
    """A reading that kept the title line as a direction anyway: drop it, so it
    does not ride on the first line. Only directions before the first line,
    and only ones that are a title line at the top of the source word for word."""
    speakers = [i.get("character") or "" for i in items if i.get("kind") == "line"]
    cast_keys = {_name_key(c) for c in list(cast) + speakers if _name_key(c)}
    raw_lines = (source or "").split("\n")
    titles = {normalise(raw_lines[i]) for i in _title_rows(raw_lines, cast_keys)}
    if not titles:
        return items
    out = list(items)
    while out and out[0].get("kind") == "direction" and normalise(_strip_brackets(out[0].get("text") or "")) in titles:
        out.pop(0)
    return out


def _rank_cast(lines: Sequence[Dict]) -> List[str]:
    speakers = Counter(l.get("character") for l in lines if l.get("character"))
    return [name for name, _ in speakers.most_common()]


def read_scenes(scenes: List[Dict], client, model: str = READER_MODEL,
                workers: int = READER_WORKERS, cancel_event=None,
                on_progress=None, budget: Optional[int] = None) -> List[Dict]:
    """Read every scene that carries its source, side by side, and fold the result in.

    A scene comes from script_parser.whole_scene with its rule-parsed lines
    and its span's text under "_source_text". A trusted reading replaces the
    lines and reseats the leads; either way the scene gets a "reading" record
    (model, flagged, problems, items, characters) for original_snapshot.
    """
    todo = [s for s in scenes if s.get("_source_text")]
    if not todo:
        return scenes

    # `budget` is how many more scenes this account may have read this month
    # (services/reading_budget). The ones past it keep the rule lines, flagged,
    # without a call: the same outcome as a reading that could not be trusted.
    over = set() if budget is None else {id(s) for s in todo[max(0, budget):]}

    def one(scene: Dict) -> Dict:
        if cancel_event is not None and cancel_event.is_set():
            return {"skip": True}
        if id(scene) in over:
            from app.services.reading_budget import LIMIT_PROBLEM
            result = read_scene(scene["_source_text"], scene.get("lines") or [], None, model)
            result["problems"] = [LIMIT_PROBLEM]
            result["seconds"] = 0.0
            return result
        started = time.monotonic()
        result = read_scene(scene["_source_text"], scene.get("lines") or [], client, model)
        result["seconds"] = round(time.monotonic() - started, 1)
        return result

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        results = list(pool.map(one, todo))

    flagged = 0
    for scene, result in zip(todo, results):
        if result.get("skip"):
            continue
        lines = result["lines"]
        cast = _rank_cast(lines)
        if not result["flagged"] and len(cast) >= 2:
            scene["lines"] = lines
            scene["cast"] = cast
            scene["character_1"], scene["character_2"] = cast[0], cast[1]
        elif not result["flagged"]:
            # Grounded, but with one speaker it is not a scene; keep the rules.
            result = dict(result, flagged=True, problems=["the reading has fewer than two speakers"])
        flagged += bool(result["flagged"])
        scene["reading"] = {
            "model": result["model"],
            "flagged": bool(result["flagged"]),
            "problems": result.get("problems", []),
            "attempts": result.get("attempts", 0),
            "items": result["items"] if not result["flagged"] else lines_to_items(scene.get("lines") or []),
            "characters": result.get("characters", []),
        }
    if on_progress:
        read = len(todo) - flagged
        on_progress(f"Read {read} of {len(todo)} scenes line by line"
                    + (f", {flagged} kept as parsed" if flagged else ""))
    return scenes
