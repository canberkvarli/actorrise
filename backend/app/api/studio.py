"""The Studio notebook, synced to the account (CAN-17).

The client keeps the notebook in the browser and syncs each role here. Every
role is a JSON document; the newest `updated_at` (the client's clock, in ms)
wins, so two devices editing the same role settle on the last edit. Deletes
are tombstones, returned by GET, so the other devices drop the role too.

Only the owner ever reads or writes a role: every query is scoped by user_id,
and the primary key is (user_id, role_id), so a role id guessed from elsewhere
cannot reach another actor's row.
"""

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.studio import StudioRole
from app.models.user import User

router = APIRouter(prefix="/api/studio", tags=["studio"])

#: One role's JSON. Generous for writing (a long notebook is ~20 KB), small enough to stop abuse.
MAX_ROLE_BYTES = 256 * 1024
#: Live roles per actor.
MAX_ROLES = 200
ROLE_ID = r"^[A-Za-z0-9-]{1,40}$"


class RoleOut(BaseModel):
    id: str
    updated_at: int
    deleted: bool = False
    data: Optional[Dict[str, Any]] = None


class RoleIn(BaseModel):
    updated_at: int
    data: Dict[str, Any]


class PutResult(BaseModel):
    applied: bool
    role: RoleOut


def _out(r: StudioRole) -> RoleOut:
    return RoleOut(
        id=r.role_id,
        updated_at=int(r.client_updated_at),
        deleted=bool(r.deleted),
        data=None if r.deleted else r.data,
    )


def _get(db: Session, user_id: int, role_id: str) -> Optional[StudioRole]:
    return db.query(StudioRole).filter(StudioRole.user_id == user_id, StudioRole.role_id == role_id).first()


@router.get("/roles", response_model=List[RoleOut])
def list_roles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every role, tombstones included, so a device can drop what was deleted elsewhere."""
    rows = (
        db.query(StudioRole)
        .filter(StudioRole.user_id == current_user.id)
        .order_by(StudioRole.client_updated_at.desc())
        .all()
    )
    return [_out(r) for r in rows]


@router.put("/roles/{role_id}", response_model=PutResult)
def put_role(
    body: RoleIn,
    role_id: str = Path(..., pattern=ROLE_ID),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a role if this write is newer than what is stored; otherwise hand back the stored one."""
    if len(json.dumps(body.data, separators=(",", ":"))) > MAX_ROLE_BYTES:
        raise HTTPException(status_code=413, detail="This role is too large to save.")
    row = _get(db, current_user.id, role_id)
    if row is not None and int(row.client_updated_at) > body.updated_at:
        return PutResult(applied=False, role=_out(row))
    if row is None or row.deleted:
        live = (
            db.query(StudioRole)
            .filter(StudioRole.user_id == current_user.id, StudioRole.deleted.is_(False))
            .count()
        )
        if live >= MAX_ROLES:
            raise HTTPException(status_code=409, detail="That's the most roles one notebook can hold.")
    if row is None:
        row = StudioRole(user_id=current_user.id, role_id=role_id)
        db.add(row)
    row.data = body.data
    row.client_updated_at = body.updated_at
    row.deleted = False
    db.commit()
    db.refresh(row)
    return PutResult(applied=True, role=_out(row))


@router.delete("/roles/{role_id}", response_model=RoleOut)
def delete_role(
    role_id: str = Path(..., pattern=ROLE_ID),
    updated_at: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tombstone a role. A newer edit from another device wins over an older delete."""
    row = _get(db, current_user.id, role_id)
    if row is None:
        row = StudioRole(user_id=current_user.id, role_id=role_id, client_updated_at=updated_at, deleted=True)
        db.add(row)
    elif int(row.client_updated_at) <= updated_at:
        row.deleted = True
        row.data = None
        row.client_updated_at = updated_at
    db.commit()
    db.refresh(row)
    return _out(row)
