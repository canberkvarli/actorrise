"""The language a rehearsal is spoken in.

Decided from the script, never from the UI locale: an actor on the English UI
can rehearse a Turkish Hamlet, and an actor on the Turkish UI rehearses
Chekhov in English. The answer goes to the speech recogniser, the transcriber
and the line matcher, so all three hear the same language.

Only two answers exist today: "en" and "tr". Anything else is "en", which is
what every rehearsal was before Turkish arrived.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional

SUPPORTED = ("en", "tr")
DEFAULT = "en"

# Letters only Turkish writes among the scripts we see. ö and ü are left out:
# German and Hungarian names carry them in English plays ("Müller", "Göring").
# ı, ğ and ş do not turn up in English text, nor does a dotted capital İ.
_TURKISH_ONLY = re.compile(r"[ıİğĞşŞ]")
# Common Turkish words, whole. Short function words a Turkish speech cannot
# avoid and English does not use.
_TURKISH_WORDS = frozenset(
    "ve bir bu da de ne ben sen o biz siz onlar değil mi mu mı mü için ile gibi "
    "ama çok var yok şey diye bana sana beni seni benim senin neden nasıl şimdi "
    "evet hayır".split()
)
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)

# How much of a script must look Turkish before it is. Strict on purpose: an
# English scene must never flip, because a wrong flip deafens the recogniser.
_MIN_LETTERS = 40
_MIN_TURKISH_LETTER_SHARE = 0.01  # Turkish prose runs at 3-5%; English at 0
_MIN_TURKISH_WORD_SHARE = 0.08


def normalise(language: Optional[str]) -> str:
    """A supported language code, or the default."""
    code = (language or "").strip().lower().split("-")[0].split("_")[0]
    return code if code in SUPPORTED else DEFAULT


def detect(text: str) -> str:
    """"tr" when the text is plainly Turkish, else "en"."""
    s = text or ""
    letters = sum(1 for ch in s if ch.isalpha())
    if letters < _MIN_LETTERS:
        return DEFAULT
    if len(_TURKISH_ONLY.findall(s)) / letters < _MIN_TURKISH_LETTER_SHARE:
        return DEFAULT
    words = [w.lower() for w in _WORD.findall(s)]
    if not words:
        return DEFAULT
    common = sum(1 for w in words if w in _TURKISH_WORDS)
    return "tr" if common / len(words) >= _MIN_TURKISH_WORD_SHARE else DEFAULT


# How much of an uploaded script's text is read to tell its language. The
# opening pages carry a cast list and stage directions as well as speech, and
# that is still plenty: Turkish prose runs at 3-5% ı ğ ş.
_SAMPLE_CHARS = 20000


def script_language(play_language: Optional[str], script=None, fallback: Iterable[str] = ()) -> str:
    """The language of a play: the one rule for everything that labels or
    hears it (the rehearsal payload, the scene, What's next, the scan).

    A library play says what it is (plays.language, "tr" for the Turkish
    translations). An uploaded script's play row is never marked, so the
    script is read from its own text (`raw_text`, else `source_text`), the
    same text for every scene of it, so every screen agrees. `fallback`
    (a scene's lines) is read only when the script has no text stored.
    """
    marked = normalise(play_language)
    if marked != DEFAULT or script is None:
        return marked
    text = getattr(script, "raw_text", None) or getattr(script, "source_text", None)
    if not text:
        text = " ".join(t for t in fallback if t)
    return detect(text[:_SAMPLE_CHARS])
