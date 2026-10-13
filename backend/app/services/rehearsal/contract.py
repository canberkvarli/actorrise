"""What rehearsal reads from the extractor. Four fields, in order, and no more.

The extractor (services/extraction, scene_map, script_structure) is a separate
subsystem and is not touched by v2. If rehearsal ever needs a field it does not
produce (character gender for third parts, say), that is a request to it, not
a reach into it.
"""
from __future__ import annotations

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.actor import SceneLine


class RehearsalLine(BaseModel):
    index: int
    character: str
    text: str
    direction: str | None = None


def lines_for(db: Session, scene_id: int) -> list[RehearsalLine]:
    rows = (
        db.query(SceneLine)
        .filter(SceneLine.scene_id == scene_id)
        .order_by(SceneLine.line_order)
        .all()
    )
    return [
        RehearsalLine(index=i, character=r.character_name.strip(), text=r.text,
                      direction=(r.stage_direction or None))
        for i, r in enumerate(rows)
    ]


def same_character(a: str, b: str) -> bool:
    return a.strip().casefold() == b.strip().casefold()


def partner_characters(lines: list[RehearsalLine], actor: str) -> list[str]:
    """Everyone who is not the actor, in order of first appearance. The partner
    reads them all (decision 10)."""
    seen: list[str] = []
    for line in lines:
        if same_character(line.character, actor):
            continue
        if not any(same_character(line.character, s) for s in seen):
            seen.append(line.character)
    return seen
