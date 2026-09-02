"""A speech someone briefly interrupted is still one speech.

Both parsers cut at every speaker cue, so

    HAMLET  Speak, I am bound to hear.
    GHOST   So art thou to revenge, when thou shalt hear.
    HAMLET  What?

arrives as two Hamlet fragments with somebody else between them, and both can
fall under the 75-word floor and vanish. That is how a real monologue becomes no
monologue at all.

On the play side it was costing whole titles: Hedda Gabler had 2 searchable
monologues before this and 11 after, The Master Builder 4 and 19, Rosmersholm 17
and 48. On the film/TV side the shape of the loss is even clearer — of 2,746
film and TV pieces deleted at the 75-word floor, **74% were 55-74 words** with a
median of 59 and not one under 40. They cluster just under the bar, which is
what a corpus looks like when speeches are being cut in half.

The rule is NOT "merge whenever the speaker returns". The first version of this
did that and turned 61 of Hamlet's 91 speeches into stitched-together dialogue,
Miss Tesman and Berta arriving as a "monologue". Four bounds, all required:

  * the interruption must be SHORT,
  * there must be few of them,
  * what remains must be mostly one person,
  * and there must be a real run of talking somewhere in it.

The interrupting line is kept inline as ``(NAME: ...)`` rather than dropped, so
the speech is not answering a question the reader cannot see. As a parenthetical
it cannot pad the word floor, the quality gate counts it against the direction
share (which is what bounds "too much dialogue"), and the segmenter can tag it
as an `interjection` for the reader.

Shared by `plain_text_parser` and `screenplay_pdf_parser` on purpose. Two copies
of one rule is how this repo keeps producing bugs — the search review gate
applied to one query path out of five, the fingerprint written in Python and
again by hand in SQL.
"""

from __future__ import annotations

import re
from typing import Callable, List, Sequence, Tuple

#: What a speech can absorb and still be one speech. A character answering "Ay,
#: my lord" does not end Hamlet's thought; forty words back is a scene.
MAX_INTERRUPTION_WORDS = 15

#: ...and how many times. One or two beats is a speech with interjections in it;
#: five is a duologue wearing a monologue's name.
MAX_INTERRUPTIONS = 2

#: Share of the merged speech that may belong to anyone else. The per-line caps
#: are not enough alone: two 15-word replies inside a 70-word exchange is still
#: a conversation.
MAX_INTERJECTION_SHARE = 0.20

#: At least one of the character's own parts has to be a real run of talking.
#: Without this, three one-line replies merge into a "monologue" that never was.
MIN_ANCHOR_WORDS = 40

#: Nesting a stray bracket inside the "(NAME: ...)" wrapper corrupts both.
_BRACKETS = re.compile(r"[()\[\]]")

Block = Tuple[str, str]


def merge_interrupted_speeches(
    blocks: Sequence[Block],
    *,
    spoken_of: Callable[[str], str],
    max_interruption_words: int = MAX_INTERRUPTION_WORDS,
    max_interruptions: int = MAX_INTERRUPTIONS,
    max_interjection_share: float = MAX_INTERJECTION_SHARE,
    min_anchor_words: int = MIN_ANCHOR_WORDS,
) -> List[Block]:
    """Rejoin speeches split by a brief interruption.

    ``blocks`` is the ordered ``(character, body)`` sequence the parser found.
    ``spoken_of`` turns one body into just the words said aloud — the two
    parsers normalise differently (Gutenberg italics vs screenplay wrylies), so
    the caller supplies it rather than this module guessing.
    """
    merged: List[Block] = []
    i, n = 0, len(blocks)
    while i < n:
        character, body = blocks[i]
        parts = [body]
        interjections: List[str] = []
        j = i + 1

        while j + 1 < n and len(interjections) < max_interruptions:
            other_name, other_body = blocks[j]
            next_name, next_body = blocks[j + 1]
            # The speech has to resume with the SAME speaker, and the thing in
            # between has to be somebody else being brief.
            if next_name != character or other_name == character:
                break
            interjection = _BRACKETS.sub("", spoken_of(other_body)).strip()
            if not interjection:
                break
            if len(interjection.split()) > max_interruption_words:
                break
            interjections.append(f"({other_name}: {interjection})")
            parts.append(interjections[-1])
            parts.append(next_body)
            j += 2

        if len(parts) > 1 and not _is_one_speech(
            parts, interjections, spoken_of,
            max_interjection_share, min_anchor_words,
        ):
            # It read as a conversation. Leave the pieces alone and let the word
            # floor judge each on its own merits.
            merged.append((character, body))
            i += 1
            continue

        merged.append((character, " ".join(parts)))
        i = j if j > i + 1 else i + 1
    return merged


def _is_one_speech(
    parts: Sequence[str],
    interjections: Sequence[str],
    spoken_of: Callable[[str], str],
    max_interjection_share: float,
    min_anchor_words: int,
) -> bool:
    """Is this merge one speech with interruptions, or a scene?"""
    own = [spoken_of(p) for p in parts if p not in interjections]
    own_words = sum(len(p.split()) for p in own)
    # minus one token for the "(NAME:" wrapper we added
    other_words = sum(max(0, len(s.split()) - 1) for s in interjections)
    total = own_words + other_words
    if not total:
        return False
    if other_words / total > max_interjection_share:
        return False
    return max((len(p.split()) for p in own), default=0) >= min_anchor_words
