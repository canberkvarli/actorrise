"""Choosing more scenes from a script that is already on the shelf.

An upload builds what was ticked and nothing else. Coming back for more used to
mean Redo (which throws away what was built, rehearsal history included) or
uploading the file again as a second script. This is the third way: the same
picker, with what is built already marked, building only the new ticks.

Also here: the genre list, since it is cleaned the same way wherever it lands.
"""

from __future__ import annotations

from typing import Iterable, List, Optional, Sequence, Set, Tuple

MAX_GENRES = 3

# Scenes a plan may hold per script. None is unlimited. The same table the
# picker reads (components/practice/UploadProvider.tsx SCENE_ALLOWANCE); the
# picker was the only thing enforcing it, which is fine for an upload and not
# for an endpoint that adds to a script.
SCENE_ALLOWANCE = {"free": 1}


def clean_genres(raw) -> List[str]:
    """Up to three genres, in order, each once.

    Accepts the model's list, a single string, or a comma or slash list typed
    into one field. "Comedy-Drama" stays whole: it is a label people use.
    """
    if raw is None:
        return []
    items = [raw] if isinstance(raw, str) else list(raw)
    out: List[str] = []
    seen: Set[str] = set()
    for item in items:
        if not isinstance(item, str):
            continue
        for part in item.replace("/", ",").split(","):
            name = part.strip()
            if not name:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(name[:30])
            if len(out) == MAX_GENRES:
                return out
    return out


def apply_genres(script, raw) -> None:
    """Write the list and keep `genre` as its first entry."""
    genres = clean_genres(raw)
    if genres:
        script.genres = genres
        script.genre = genres[0]


def _norm(label: Optional[str]) -> str:
    return " ".join((label or "").lower().split())


def scene_key(act: Optional[str], scene_number: Optional[str]) -> Optional[Tuple[str, str]]:
    """How a built scene is recognised in a fresh read of the same script.

    By its headings, because those are what a reader prints the same way twice.
    An unlabelled scene has no key: there is nothing stable to match it on, so
    it is offered again rather than guessed at.
    """
    if not scene_number:
        return None
    return (_norm(act), _norm(scene_number))


def built_keys(scenes: Iterable) -> Set[Tuple[str, str]]:
    keys = set()
    for scene in scenes:
        key = scene_key(getattr(scene, "act", None), getattr(scene, "scene_number", None))
        if key:
            keys.add(key)
    return keys


def built_indices(scanned: Sequence, keys: Set[Tuple[str, str]]) -> List[int]:
    """Which rows of a fresh scan are already on the shelf."""
    out = []
    for row in scanned:
        key = scene_key(getattr(row, "act_label", None), getattr(row, "scene_label", None))
        if key and key in keys:
            out.append(row.index)
    return out


def unbuilt_picks(picked: Iterable[dict], keys: Set[Tuple[str, str]]) -> List[dict]:
    """Drop ticks for scenes that are built already. The client hides them, the
    server does not trust that it did."""
    out = []
    for p in picked or []:
        if not isinstance(p, dict):
            continue
        key = scene_key(p.get("act_label"), p.get("scene_label"))
        if key and key in keys:
            continue
        out.append(p)
    return out


def is_new_scene(scene_data: dict, keys: Set[Tuple[str, str]]) -> bool:
    key = scene_key(scene_data.get("act"), scene_data.get("scene_number"))
    return key is None or key not in keys
