"""Normalise metadata a source PRINTS, and prefer it over metadata we guess.

Two problems this solves.

**Precedence.** ContentAnalyzer infers tone, gender and playing age with an LLM.
But StageAgent, AuditionScenes and NYCastings *print* those fields in a sidebar,
put there by the people who know the play. Inferring what the page already
states is both less accurate and needlessly expensive. `scrape_stageagent.py`
already worked this way ("no LLM extraction needed since the data is already
structured"); this module makes it a reusable contract instead of one scraper's
private habit.

**Vocabulary drift.** The StageAgent import wrote its own printed vocabulary
straight into the column — "Young Adult", "Late Teen", "Adult, Mature Adult" —
while the age filter only ever offered ``teens|20s|30s|40s|50s|60+``. Together
with an older numeric scheme ("30-40", "20-30") that left the DB holding 48
distinct age values, most of which no filter can match. Printed metadata is only
worth more than inferred metadata if it lands in the vocabulary the app queries,
so every adapter goes through the normalisers below.

Provenance is recorded per field so a later audit can tell a stated fact from a
guess, and re-run only the guesses.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# --- canonical vocabularies -------------------------------------------------
# Sources of truth: components/search/SearchFiltersSheet.tsx (what the user can
# pick) and services/search/query_optimizer.py (what free text maps to). Adding
# a value here without adding it there makes rows unreachable.

AGE_RANGES = ("child", "teens", "20s", "30s", "40s", "50s", "60+", "any")
GENDERS = ("male", "female", "any")
TONES = (
    "defiant", "anguished", "contemplative", "dark", "dramatic", "comedic",
    "philosophical", "inspirational", "sarcastic", "melancholic", "romantic",
    "joyful",
)

_GENDER_MAP = {
    "m": "male", "male": "male", "man": "male", "men": "male", "boy": "male",
    "f": "female", "female": "female", "woman": "female", "women": "female",
    "girl": "female",
    "any": "any", "either": "any", "either gender": "any", "neutral": "any",
    "non-binary": "any", "nonbinary": "any", "all": "any", "unspecified": "any",
}

# Word-form playing ages, as printed by StageAgent and the audition aggregators.
_AGE_WORD_MAP = {
    "child": "child",
    "kid": "child",
    "early teen": "teens",
    "late teen": "teens",
    "teen": "teens",
    "teens": "teens",
    "young adult": "20s",
    "adult": "30s",
    "mature adult": "50s",
    "elderly": "60+",
    "senior": "60+",
    "any": "any",
}

_AGE_DECADE = re.compile(r"^(\d{1,3})s$")
_AGE_PLUS = re.compile(r"^(\d{1,3})\s*\+$")
_AGE_BAND = re.compile(r"^(\d{1,3})\s*[-–—]\s*(\d{1,3})$")
_AGE_BARE = re.compile(r"^(\d{1,3})$")

_TONE_MAP = {
    "comic": "comedic", "comedy": "comedic", "funny": "comedic",
    "humorous": "comedic", "light": "comedic",
    "serious": "dramatic", "drama": "dramatic", "intense": "dramatic",
    "sad": "melancholic", "wistful": "melancholic", "mournful": "melancholic",
    "angry": "defiant", "rebellious": "defiant", "determined": "defiant",
    "grief": "anguished", "desperate": "anguished", "tragic": "anguished",
    "reflective": "contemplative", "thoughtful": "contemplative",
    "sardonic": "sarcastic", "wry": "sarcastic", "ironic": "sarcastic",
    "hopeful": "inspirational", "uplifting": "inspirational",
    "love": "romantic", "tender": "romantic",
    "happy": "joyful", "playful": "joyful",
    "menacing": "dark", "sinister": "dark", "bleak": "dark",
}


def _clean(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_gender(value: Any) -> str | None:
    """Map a printed gender to ``male|female|any``. None if unrecognised."""
    v = _clean(value)
    if not v:
        return None
    return _GENDER_MAP.get(v)


def normalize_age_range(value: Any) -> str | None:
    """Map a printed playing age into the filter's vocabulary.

    Handles decades ("20s"), open tops ("60+"), numeric bands ("30-40" -> the
    decade its midpoint falls in), bare numbers, and the word forms the audition
    aggregators use. Comma-joined multi-values ("Late Teen, Young Adult") take
    the youngest, since that is the casting-relevant end for an actor browsing.
    """
    v = _clean(value)
    if not v:
        return None

    if "," in v:
        parts = [normalize_age_range(p) for p in v.split(",")]
        found = [p for p in parts if p and p != "any"]
        if not found:
            return "any" if any(p == "any" for p in parts) else None
        return min(found, key=AGE_RANGES.index)

    if v in _AGE_WORD_MAP:
        return _AGE_WORD_MAP[v]

    def bucket(age: int) -> str | None:
        if age < 4 or age > 120:      # "900+" — junk, not a playing age
            return None
        # Kept separate from "teens" on purpose: teachers and youth programmes
        # look for children's material specifically, and folding a 9-year-old in
        # with a 19-year-old throws away the distinction they are searching on.
        if age < 13:
            return "child"
        if age < 20:
            return "teens"
        if age >= 60:
            return "60+"
        return f"{(age // 10) * 10}s"

    m = _AGE_DECADE.match(v)
    if m:
        return bucket(int(m.group(1)))
    m = _AGE_PLUS.match(v)
    if m:
        # bucket() first, so an implausible age ("900+", a Time Lord) is
        # rejected rather than sliding into 60+ on the >= test.
        return bucket(int(m.group(1)))
    m = _AGE_BAND.match(v)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        return bucket((lo + hi) // 2)
    m = _AGE_BARE.match(v)
    if m:
        return bucket(int(m.group(1)))
    return None


def normalize_tone(value: Any) -> str | None:
    """Map a printed tone/style onto the canonical tone list."""
    v = _clean(value)
    if not v:
        return None
    if v in TONES:
        return v
    return _TONE_MAP.get(v)


_NORMALIZERS = {
    "character_gender": normalize_gender,
    "character_age_range": normalize_age_range,
    "tone": normalize_tone,
}


@dataclass
class ResolvedMetadata:
    """Merged metadata plus where each field came from."""
    values: dict[str, Any] = field(default_factory=dict)
    provenance: dict[str, str] = field(default_factory=dict)  # field -> source|inferred

    def stated_fields(self) -> list[str]:
        return sorted(k for k, v in self.provenance.items() if v == "source")


def resolve_metadata(
    provided: dict[str, Any] | None,
    inferred: dict[str, Any] | None,
) -> ResolvedMetadata:
    """Merge printed metadata over inferred metadata, normalising both.

    A printed value wins only when it normalises to something the app can query.
    "Playing Age: Ageless" is stated but unusable, so the inferred value stands
    rather than writing an unmatchable string into the column.
    """
    out = ResolvedMetadata()
    provided = provided or {}
    inferred = inferred or {}

    for key in set(provided) | set(inferred):
        norm = _NORMALIZERS.get(key)

        raw_provided = provided.get(key)
        if raw_provided not in (None, ""):
            value = norm(raw_provided) if norm else raw_provided
            if value not in (None, ""):
                out.values[key] = value
                out.provenance[key] = "source"
                continue

        raw_inferred = inferred.get(key)
        if raw_inferred not in (None, ""):
            value = norm(raw_inferred) if norm else raw_inferred
            if value not in (None, ""):
                out.values[key] = value
                out.provenance[key] = "inferred"

    return out


def fields_needing_inference(
    provided: dict[str, Any] | None,
    wanted: tuple[str, ...] = ("character_gender", "character_age_range", "tone"),
) -> list[str]:
    """Which fields the source did NOT usably state, so the LLM is asked only
    for those. This is where the cost saving on structured sources comes from."""
    provided = provided or {}
    missing = []
    for key in wanted:
        raw = provided.get(key)
        if raw in (None, ""):
            missing.append(key)
            continue
        norm = _NORMALIZERS.get(key)
        if norm and norm(raw) in (None, ""):
            missing.append(key)
    return missing
