"""The number guard: Cue may only say a price or a trial length the server gave it.

The prompt already says so. This is the part that does not depend on the model
listening. Every sentence Cue writes passes through `check_sentence` before it
reaches the actor. A sentence that names an amount of money or a span of
days/weeks/months is let through only when that number appeared in a tool
result during the same reply; otherwise the sentence is swapped for a line that
sends them to /pricing. Trial length differs per actor (trial_length.py), so a
remembered "two weeks" is exactly the mistake this exists to stop.

Conservative on purpose: a correct number the model derived itself ("$8.25 a
month" from an annual price) is also replaced. Wrong-but-blocked costs a
sentence; wrong-and-shown costs trust.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

REPLACEMENT = "I'd rather not guess a number there, /pricing has the current one."

_WORD_NUMS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "twenty": 20,
    "thirty": 30, "sixty": 60, "ninety": 90,
}
_UNIT_DAYS = {"day": 1, "week": 7, "month": 30}

_MONEY = re.compile(r"(?:\$|usd\s?|€|£)\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(?:dollars|bucks|usd)\b", re.I)
_SPAN = re.compile(
    r"\b(\d+|" + "|".join(sorted(_WORD_NUMS, key=len, reverse=True)) + r")[\s-]*(day|week|month)s?\b",
    re.I,
)
# "a month" in "15 messages a month" is a rate, not a span. Only a span that
# reads as a length of time for something free counts.
_SPAN_CONTEXT = re.compile(r"\b(trial|free|taste|plus for|of plus|before (?:you'?re |it'?s )?charged)\b", re.I)

# "15 messages a month", "5 reads a month": a count then a noun before "a month"
# makes it a rate. "free for a week" has no count and is still checked.
_RATE_BEFORE = re.compile(r"\b\d+\s+[a-z]+\s*$", re.I)

_SENTENCE_END =re.compile(r"(?<=[.!?])\s+|\n+")


def _num(token: str) -> float:
    t = token.lower()
    if t in _WORD_NUMS:
        return float(_WORD_NUMS[t])
    return float(t.replace(",", "."))


def allowed_numbers(tool_results: Iterable[Any]) -> set[float]:
    """Every number found anywhere in this reply's tool results.

    Cents are also offered as dollars and day counts as weeks, because the
    tools speak in cents and days while Cue speaks to people.
    """
    found: set[float] = set()

    def walk(v: Any, key: str = "") -> None:
        if isinstance(v, bool):
            return
        if isinstance(v, (int, float)):
            n = float(v)
            found.add(n)
            if key.endswith("_cents"):
                found.add(round(n / 100, 2))
            if "day" in key:
                if n % 7 == 0:
                    found.add(n / 7)
            return
        if isinstance(v, dict):
            for k, x in v.items():
                walk(x, str(k))
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x, key)
        elif isinstance(v, str):
            for m in re.findall(r"\d+(?:\.\d+)?", v):
                found.add(float(m))

    for r in tool_results:
        walk(r)
    return found


def check_sentence(sentence: str, allowed: set[float]) -> str:
    """Return the sentence, or the replacement if it names an ungrounded number."""
    for m in _MONEY.finditer(sentence):
        n = _num(m.group(1) or m.group(2))
        if n not in allowed:
            return REPLACEMENT
    if _SPAN_CONTEXT.search(sentence):
        for m in _SPAN.finditer(sentence):
            if m.group(1).lower() in ("a", "an") and _RATE_BEFORE.search(sentence[: m.start()]):
                continue
            n = _num(m.group(1))
            unit = m.group(2).lower()
            days = n * _UNIT_DAYS[unit]
            if n not in allowed and days not in allowed:
                return REPLACEMENT
    return sentence


class SentenceGate:
    """Holds streamed text until a sentence is complete, then checks it.

    Streaming stays streaming, one sentence behind the model instead of one
    token behind, which is the price of never showing a number and then
    taking it back.
    """

    def __init__(self) -> None:
        self.buf = ""
        self.allowed: set[float] = set()
        self.replaced = 0

    def feed(self, text: str) -> list[str]:
        self.buf += text
        out: list[str] = []
        while True:
            m = _SENTENCE_END.search(self.buf)
            if not m:
                break
            sentence, sep = self.buf[: m.start()], self.buf[m.start(): m.end()]
            self.buf = self.buf[m.end():]
            out.append(self._check(sentence) + sep)
        return out

    def flush(self) -> list[str]:
        if not self.buf:
            return []
        rest, self.buf = self.buf, ""
        return [self._check(rest)]

    def _check(self, sentence: str) -> str:
        checked = check_sentence(sentence, self.allowed)
        if checked is not sentence and checked == REPLACEMENT:
            self.replaced += 1
        return checked
