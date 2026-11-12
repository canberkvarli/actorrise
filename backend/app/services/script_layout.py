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


def remember_title(scene, title: str) -> None:
    """Rename a scene, keeping the name it was read with the first time, so
    the map can be put back the way it was read."""
    if title == scene.title:
        return
    snap = dict(scene.original_snapshot) if isinstance(scene.original_snapshot, dict) else {}
    if "read_title" not in snap:
        snap["read_title"] = scene.title
        scene.original_snapshot = snap
    scene.title = title


def reset_layout(scenes: Sequence) -> int:
    """The map as it was read: every scene back under the heading and with
    the name the reader gave it, and the order back to the order they were
    built in. Lines, line edits and runs are not touched. A deleted scene is
    gone; choosing more scenes builds it again. Returns how many scenes
    changed."""
    changed = 0
    for scene in scenes:
        touched = scene.script_order is not None
        snap = dict(scene.original_snapshot) if isinstance(scene.original_snapshot, dict) else None
        if snap is not None:
            head = snap.pop("read_heading", None)
            if isinstance(head, dict):
                scene.act = head.get("act")
                scene.scene_number = head.get("scene_number")
                touched = True
            title = snap.pop("read_title", None)
            if isinstance(title, str) and title.strip():
                scene.title = title
                touched = True
            if touched:
                scene.original_snapshot = snap
        scene.script_order = None
        changed += 1 if touched else 0
    return changed
