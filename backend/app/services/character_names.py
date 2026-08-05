"""Reconciling the speaker labels an uploaded script actually uses.

A script is written by a human, so the cue labels drift: the same person is
"DANIEL" on page one and "DAN" on page three, a display name picked up from the
title page ("Steve Komphela") never matches the cues ("STEVE"), and a moment where
two characters speak together arrives as its own cue ("MOEKETSI AND DAN:").

The parser reproduces all of that faithfully, which is correct — it just means
something downstream has to reconcile it, or the actor ends up picking a
"character" that owns four lines of a forty-three-line scene.

The split here is deliberate:

  canonical_character_map()  folds together only what cannot plausibly be two
                             different people (case, punctuation, (CONT'D), and
                             full-name containment). Safe to apply silently.

  suggest_character_merges() flags nickname-shaped pairs for the actor to confirm.
                             "Dan"/"Daniel" is almost always one person — but
                             "Ann"/"Anna" is almost always two, and there is no way
                             to tell from spelling alone. Ask; don't guess.

  split_compound_speaker()   recognises a joint cue as a line belonging to several
                             known characters rather than a character of its own.
"""

from __future__ import annotations

import re
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

# "(CONT'D)", "(V.O.)", "(O.S.)", "(OFF)", "(MORE)" — delivery notes, not identity.
_PARENTHETICAL = re.compile(r"\s*\([^)]*\)\s*$")
_TRAILING_PUNCT = re.compile(r"[\s:;,.\-–—]+$")
_LEADING_PUNCT = re.compile(r"^[\s:;,.\-–—]+")

# Separators that can join several speakers into one cue.
_COMPOUND_SPLIT = re.compile(r"\s*(?:&|/|\+|\band\b|\bAND\b|,)\s*")

# A stem shorter than this is too thin to be worth flagging as a nickname.
_MIN_NICKNAME_STEM = 3


def normalize_name(name: object) -> str:
    """Identity key for a speaker label: case, spacing, punctuation and cue notes removed."""
    text = str(name or "")
    text = _PARENTHETICAL.sub("", text)
    text = _LEADING_PUNCT.sub("", text)
    text = _TRAILING_PUNCT.sub("", text)
    return " ".join(text.split()).casefold()


def _tokens(name: object) -> List[str]:
    return normalize_name(name).split()


def _pick_canonical(variants: Sequence[str], line_counts: Mapping[str, int]) -> str:
    """The spelling the scene should standardise on.

    Whichever spelling the LINES use wins, because rehearsal ownership is matched
    against line.character_name — standardising on a name no line uses would hand
    the actor an empty part. Ties go to the shorter label, which is what a cue
    normally looks like next to a full display name.
    """
    return sorted(variants, key=lambda n: (-line_counts.get(n, 0), len(n), n))[0]


def canonical_character_map(
    names: Iterable[str],
    line_counts: Optional[Mapping[str, int]] = None,
) -> Dict[str, str]:
    """Map every speaker label to the one label that should represent that character.

    Folds together, in order:
      1. labels that differ only by case, spacing, punctuation or a cue parenthetical
      2. labels where one full name contains the other ("Steve" / "Steve Komphela")

    Nickname-shaped pairs are left apart on purpose — see suggest_character_merges.
    """
    names = [n for n in names if str(n or "").strip()]
    if not names:
        return {}
    counts = dict(line_counts or {})

    # 1. Exact identity after normalization.
    groups: Dict[str, List[str]] = {}
    for name in names:
        groups.setdefault(normalize_name(name), []).append(name)

    keys = list(groups)
    known_tokens = {k: _tokens(k) for k in keys}

    # 2. Full-name containment — one label's words wholly inside another's, in order.
    #    A compound cue ("moeketsi and dan") must not swallow its participants, so
    #    anything that reads as a joint cue is excluded from this pass.
    compound_keys = {
        k for k in keys if split_compound_speaker(k, [x for x in keys if x != k])
    }

    parent: Dict[str, str] = {k: k for k in keys}

    def find(k: str) -> str:
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i, a in enumerate(keys):
        if a in compound_keys:
            continue
        for b in keys[i + 1:]:
            if b in compound_keys:
                continue
            ta, tb = known_tokens[a], known_tokens[b]
            if not ta or not tb or ta == tb:
                continue
            short, long_ = (ta, tb) if len(ta) < len(tb) else (tb, ta)
            # Contiguous run of whole words — "steve" inside "steve komphela".
            if any(
                long_[s:s + len(short)] == short
                for s in range(len(long_) - len(short) + 1)
            ):
                union(a, b)

    clusters: Dict[str, List[str]] = {}
    for key in keys:
        clusters.setdefault(find(key), []).extend(groups[key])

    mapping: Dict[str, str] = {}
    for variants in clusters.values():
        canonical = _pick_canonical(variants, counts)
        for variant in variants:
            mapping[variant] = canonical
    return mapping


def split_compound_speaker(
    name: str,
    known_characters: Iterable[str],
) -> Optional[List[str]]:
    """Participants of a joint cue like "MOEKETSI AND DAN", or None if it isn't one.

    Requires EVERY part to be a character the scene already knows, so a name that
    merely contains a separator ("Anderson", "Sandra and the dog") is left alone.
    """
    raw = str(name or "").strip()
    if not raw:
        return None

    known = {normalize_name(k): k for k in known_characters if str(k or "").strip()}
    if not known:
        return None
    if normalize_name(raw) in known:
        return None  # it's a character in its own right

    parts = [p for p in _COMPOUND_SPLIT.split(raw) if p and p.strip()]
    if len(parts) < 2:
        return None

    resolved: List[str] = []
    for part in parts:
        key = normalize_name(part)
        if key not in known:
            return None
        actual = known[key]
        if actual not in resolved:
            resolved.append(actual)

    return resolved if len(resolved) >= 2 else None


def line_belongs_to(
    line_character: str,
    user_characters: Iterable[str],
    known_characters: Iterable[str] = (),
) -> bool:
    """Whether a line is the actor's to speak.

    Handles joint cues: a line cued "MOEKETSI AND DAN" belongs to whoever is
    playing Moeketsi or Dan, rather than to a phantom third character.
    """
    owned = {normalize_name(c) for c in user_characters if str(c or "").strip()}
    if not owned:
        return False

    key = normalize_name(line_character)
    if key in owned:
        return True

    known = [k for k in known_characters if normalize_name(k) != key]
    participants = split_compound_speaker(line_character, known)
    if participants:
        return any(normalize_name(p) in owned for p in participants)
    return False


def resolve_rehearsal_roles(
    user_characters: Iterable[str],
    line_character_names: Sequence[str],
    declared_character_names: Tuple,
):
    """Resolve the actor's chosen role(s) to the exact cue names the scene uses.

    Returns (resolved_roles, ai_character), or None if nothing resolved.

    Rehearsal ownership is matched against line.character_name, so every role must
    come back in the casing the cues use — otherwise the actor gets an empty part.
    """
    lines = [c for c in line_character_names if str(c or "").strip()]
    counts = {c: 1 for c in lines}
    mapping = canonical_character_map(
        list(lines) + [c for c in declared_character_names if c], line_counts=counts
    )

    resolved: List[str] = []
    for choice in user_characters:
        if not str(choice or "").strip():
            continue
        key = normalize_name(choice)

        match = next((c for c in lines if normalize_name(c) == key), None)
        if match is None:
            # A display name may stand for a cue name — "Steve Komphela" → "Steve".
            for original, canonical in mapping.items():
                if normalize_name(original) == key:
                    match = next(
                        (c for c in lines if normalize_name(c) == normalize_name(canonical)),
                        None,
                    )
                    if match:
                        break
        if match is None and not lines:
            match = next(
                (c for c in declared_character_names if normalize_name(c) == key), None
            )
        if match and match not in resolved:
            resolved.append(match)

    if not resolved:
        return None

    ai = next(
        (c for c in lines if c not in resolved and not split_compound_speaker(
            c, [x for x in lines if x != c])),
        None,
    )
    if ai is None:
        # The actor is covering everyone — keep a sensible partner name on the
        # session rather than failing the start.
        ai = next(
            (c for c in declared_character_names if c and c not in resolved),
            resolved[0],
        )
    return resolved, ai


def canonicalize_scene_characters(scene_data: dict) -> dict:
    """Standardise the speaker labels within one parsed scene.

    Applied as scenes come out of an uploaded script, so a scene never reaches the
    actor with the same person under two spellings of the same name, or with a
    declared character that no cue in the scene actually matches.

    Only the safe folds are applied (see canonical_character_map) — a nickname
    split like "Dan"/"Daniel" is left for the actor to confirm.

    Returns a new dict; the input is not modified.
    """
    if not isinstance(scene_data, dict):
        return scene_data

    lines = scene_data.get("lines") or []
    if not lines:
        return scene_data

    counts: Dict[str, int] = {}
    for line in lines:
        name = (line or {}).get("character")
        if name:
            counts[name] = counts.get(name, 0) + 1
    if not counts:
        return scene_data

    declared = [scene_data.get("character_1"), scene_data.get("character_2")]
    mapping = canonical_character_map(
        list(counts) + [d for d in declared if d], line_counts=counts
    )

    out = dict(scene_data)
    out["lines"] = [
        {**line, "character": mapping.get(line.get("character"), line.get("character"))}
        if isinstance(line, dict) else line
        for line in lines
    ]
    for key in ("character_1", "character_2"):
        name = scene_data.get(key)
        if not name:
            continue
        canonical = mapping.get(name, name)
        # Never point a declared character at a name no cue uses.
        out[key] = canonical if canonical in counts else name
    return out


def suggest_character_merges(
    names: Iterable[str],
    line_counts: Optional[Mapping[str, int]] = None,
) -> List[Tuple[str, str]]:
    """Pairs that look like one character written two ways, for the actor to confirm.

    Catches the shortened-first-name case ("Dan" / "Daniel") that
    canonical_character_map deliberately refuses to merge on its own.

    Returns (keep, merge_into_keep) with the better-attested spelling first, since
    that is the direction the editor's rename applies.
    """
    names = [n for n in names if str(n or "").strip()]
    counts = dict(line_counts or {})
    canonical = canonical_character_map(names, counts)

    # Only consider labels that survived as characters in their own right.
    surviving = sorted({canonical[n] for n in names})
    compound = {
        n for n in surviving if split_compound_speaker(n, [x for x in surviving if x != n])
    }
    candidates = [n for n in surviving if n not in compound]

    suggestions: List[Tuple[str, str]] = []
    for i, a in enumerate(candidates):
        for b in candidates[i + 1:]:
            na, nb = normalize_name(a), normalize_name(b)
            short, long_ = (na, nb) if len(na) < len(nb) else (nb, na)
            if len(short) < _MIN_NICKNAME_STEM or short == long_:
                continue
            # A shortening, not an unrelated name: "dan" -> "daniel".
            if not long_.startswith(short):
                continue
            keep, drop = (a, b) if counts.get(a, 0) >= counts.get(b, 0) else (b, a)
            suggestions.append((keep, drop))
    return suggestions
