"""An actor's own arrangement of a script's scenes: the order, and which act
or episode each sits under.

The reader gets headings wrong sometimes (an episode split in two, a scene
filed under the act before it), so the actor can put them right. Pure, so it
is tested without a database: the route hands it the script's scenes and the
order asked for, and it writes onto the scenes.

Moving a scene under another heading changes the key `script_additions`
matches a fresh read by (act, scene number). So the first time a scene's act
changes, the heading the reader gave it is kept in `original_snapshot`
under "read_heading", and `built_keys` counts it too: a scene the actor
refiled is not offered again as unbuilt.
"""

from typing import Iterable, List, Optional, Sequence

ACT_MAX = 80
TITLE_MAX = 200


class LayoutError(ValueError):
    pass


def clean_act(act: Optional[str]) -> Optional[str]:
    """A heading as kept: trimmed, one space between words, empty as none."""
    text = " ".join((act or "").split())
    if not text:
        return None
    return text[:ACT_MAX]


def apply_layout(scenes: Sequence, entries: Iterable[dict]) -> List:
    """Put `scenes` in the order of `entries` ([{"id", "act"}]), each under
    the act it names. Every scene of the script must be named exactly once:
    a partial list would leave the rest with no place. Returns the scenes in
    their new order."""
    by_id = {s.id: s for s in scenes}
    entries = list(entries)
    ids = [e.get("id") if isinstance(e, dict) else None for e in entries]
    if len(ids) != len(set(ids)) or set(ids) != set(by_id):
        raise LayoutError("The order has to name every scene of the script once.")
    out = []
    for i, entry in enumerate(entries):
        scene = by_id[entry["id"]]
        act = clean_act(entry.get("act"))
        if act != (scene.act or None):
            snap = dict(scene.original_snapshot) if isinstance(scene.original_snapshot, dict) else {}
            if "read_heading" not in snap:
                snap["read_heading"] = {"act": scene.act, "scene_number": scene.scene_number}
                scene.original_snapshot = snap
            scene.act = act
        scene.script_order = i
        out.append(scene)
    return out


def read_heading(scene) -> Optional[tuple]:
    """The (act, scene number) the reader first gave a scene the actor has since refiled."""
    snap = getattr(scene, "original_snapshot", None)
    if not isinstance(snap, dict):
        return None
    head = snap.get("read_heading")
    if not isinstance(head, dict):
        return None
    return head.get("act"), head.get("scene_number")
