"""The Book's lists: the actor's own grouping of what they keep (models/book.py).

One read gives the whole picture, every list with its items and the titles to
draw them, because the Book shows them all at once and the "Keep in..." sheet
needs to know which lists a speech is already in. Lists are free and have no
limit: keeping things is the habit, and running them is what is paid for.

Items whose speech has left the Book, or whose script has been deleted, are
left in place and simply not shown, so putting either back restores them to
every list they were in.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import Monologue, MonologueFavorite, Play, UserScript
from app.models.book import BookList, BookListItem, BookListShare
from app.models.user import User

router = APIRouter(prefix="/api/book", tags=["book"])

#: A script in Recently deleted (api/scripts.py) is not on any list.
_SCRIPT_DELETED = "deleted"


class ListItemOut(BaseModel):
    id: int
    kind: Literal["speech", "sides"]
    monologue_id: Optional[int] = None
    user_script_id: Optional[int] = None
    title: str
    subtitle: Optional[str] = None
    position: int


class ListOut(BaseModel):
    id: int
    title: str
    position: int
    items: List[ListItemOut]


class ListCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class ListPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=80)


class ListOrder(BaseModel):
    ids: List[int]


class ItemCreate(BaseModel):
    monologue_id: Optional[int] = None
    user_script_id: Optional[int] = None


def _own_list(db: Session, user: User, list_id: int) -> BookList:
    row = db.query(BookList).filter(
        BookList.id == list_id,
        BookList.user_id == user.id,
        BookList.deleted_at.is_(None),
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="List not found")
    return row


def _lists(db: Session, user: User, only: Optional[int] = None) -> List[ListOut]:
    q = db.query(BookList).filter(BookList.user_id == user.id, BookList.deleted_at.is_(None))
    if only is not None:
        q = q.filter(BookList.id == only)
    lists = q.order_by(BookList.position, BookList.id).all()
    if not lists:
        return []
    ids = [int(x.id) for x in lists]

    speeches = (
        db.query(BookListItem, Monologue.character_name, Play.title)
        .join(Monologue, Monologue.id == BookListItem.monologue_id)
        .join(Play, Play.id == Monologue.play_id)
        .join(
            MonologueFavorite,
            (MonologueFavorite.monologue_id == BookListItem.monologue_id)
            & (MonologueFavorite.user_id == user.id)
            & MonologueFavorite.removed_at.is_(None),
        )
        .filter(BookListItem.list_id.in_(ids))
        .all()
    )
    sides = (
        db.query(BookListItem, UserScript.title, UserScript.author)
        .join(UserScript, UserScript.id == BookListItem.user_script_id)
        .filter(
            BookListItem.list_id.in_(ids),
            UserScript.user_id == user.id,
            or_(UserScript.processing_status.is_(None), UserScript.processing_status != _SCRIPT_DELETED),
        )
        .all()
    )

    by_list: dict = {i: [] for i in ids}
    for item, character, play in speeches:
        by_list[int(item.list_id)].append(ListItemOut(
            id=int(item.id), kind="speech", monologue_id=int(item.monologue_id),
            title=str(character), subtitle=str(play), position=int(item.position),
        ))
    for item, title, author in sides:
        by_list[int(item.list_id)].append(ListItemOut(
            id=int(item.id), kind="sides", user_script_id=int(item.user_script_id),
            title=str(title), subtitle=str(author) if author else None, position=int(item.position),
        ))
    return [
        ListOut(
            id=int(x.id),
            title=str(x.title),
            position=int(x.position),
            items=sorted(by_list[int(x.id)], key=lambda i: (i.position, i.id)),
        )
        for x in lists
    ]


@router.get("/lists", response_model=List[ListOut])
async def get_lists(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _lists(db, current_user)


@router.post("/lists", response_model=ListOut, status_code=201)
async def create_list(
    body: ListCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    top = db.query(func.coalesce(func.max(BookList.position), -1)).filter(
        BookList.user_id == current_user.id, BookList.deleted_at.is_(None)
    ).scalar()
    row = BookList(user_id=current_user.id, title=body.title.strip(), position=int(top) + 1)
    db.add(row)
    db.commit()
    return ListOut(id=int(row.id), title=str(row.title), position=int(row.position), items=[])


@router.patch("/lists/{list_id}", response_model=ListOut)
async def rename_list(
    list_id: int, body: ListPatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    row = _own_list(db, current_user, list_id)
    if body.title is not None:
        row.title = body.title.strip()  # type: ignore[assignment]
    db.commit()
    return _lists(db, current_user, only=list_id)[0]


@router.put("/lists/order", response_model=List[ListOut])
async def order_lists(
    body: ListOrder, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """The lists in the order the actor dragged them. Ids that are not theirs
    are ignored; lists left out keep their place after the ones named."""
    rows = {
        int(x.id): x
        for x in db.query(BookList).filter(BookList.user_id == current_user.id, BookList.deleted_at.is_(None))
    }
    named = [i for i in body.ids if i in rows]
    rest = sorted((i for i in rows if i not in named), key=lambda i: (rows[i].position, i))
    for pos, i in enumerate(named + rest):
        rows[i].position = pos  # type: ignore[assignment]
    db.commit()
    return _lists(db, current_user)


@router.delete("/lists/{list_id}", status_code=204)
async def delete_list(
    list_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """The list goes; what was in it stays in the Book."""
    row = _own_list(db, current_user, list_id)
    row.deleted_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    db.commit()


@router.post("/lists/{list_id}/restore", response_model=ListOut)
async def restore_list(
    list_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """The Book's undo."""
    row = db.query(BookList).filter(BookList.id == list_id, BookList.user_id == current_user.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="List not found")
    row.deleted_at = None  # type: ignore[assignment]
    db.commit()
    return _lists(db, current_user, only=list_id)[0]


@router.post("/lists/{list_id}/items", response_model=ListOut, status_code=201)
async def add_item(
    list_id: int, body: ItemCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Put a kept speech or a script of the actor's own into a list. Asking
    twice is the same as asking once."""
    if (body.monologue_id is None) == (body.user_script_id is None):
        raise HTTPException(status_code=422, detail="A speech or a script, one of the two")
    row = _own_list(db, current_user, list_id)
    if body.monologue_id is not None:
        kept = db.query(MonologueFavorite.id).filter(
            MonologueFavorite.user_id == current_user.id,
            MonologueFavorite.monologue_id == body.monologue_id,
            MonologueFavorite.removed_at.is_(None),
        ).first()
        if kept is None:
            raise HTTPException(status_code=409, detail="Keep the speech first")
        dup = BookListItem.monologue_id == body.monologue_id
    else:
        mine = db.query(UserScript.id).filter(
            UserScript.id == body.user_script_id, UserScript.user_id == current_user.id
        ).first()
        if mine is None:
            raise HTTPException(status_code=404, detail="Script not found")
        dup = BookListItem.user_script_id == body.user_script_id
    if db.query(BookListItem.id).filter(BookListItem.list_id == row.id, dup).first() is None:
        top = db.query(func.coalesce(func.max(BookListItem.position), -1)).filter(
            BookListItem.list_id == row.id
        ).scalar()
        db.add(BookListItem(
            list_id=row.id,
            monologue_id=body.monologue_id,
            user_script_id=body.user_script_id,
            position=int(top) + 1,
        ))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # the same tap, twice, at once
    return _lists(db, current_user, only=list_id)[0]


@router.delete("/lists/{list_id}/items/{item_id}", status_code=204)
async def remove_item(
    list_id: int, item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    row = _own_list(db, current_user, list_id)
    db.query(BookListItem).filter(BookListItem.id == item_id, BookListItem.list_id == row.id).delete()
    db.commit()


# ---------------------------------------------------------------- sharing

SITE = "https://www.actorrise.com"


class ShareOut(BaseModel):
    token: str
    url: str


class SharedItem(BaseModel):
    kind: Literal["speech", "sides"]
    title: str
    character: Optional[str] = None
    work: Optional[str] = None
    author: Optional[str] = None
    minutes: Optional[float] = None


class SharedList(BaseModel):
    title: str
    by: Optional[str] = None
    items: List[SharedItem]


def _share_out(token: str) -> ShareOut:
    return ShareOut(token=token, url=f"{SITE}/l/{token}")


@router.post("/lists/{list_id}/share", response_model=ShareOut)
async def share_list(
    list_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """A link to send. Asking again gives the same link while it stands."""
    row = _own_list(db, current_user, list_id)
    share = db.query(BookListShare).filter(BookListShare.list_id == row.id).first()
    if share is None:
        share = BookListShare(list_id=row.id, token=secrets.token_urlsafe(12)[:16])
        db.add(share)
    elif share.revoked_at is not None:
        share.token = secrets.token_urlsafe(12)[:16]  # type: ignore[assignment]
        share.revoked_at = None  # type: ignore[assignment]
    db.commit()
    return _share_out(str(share.token))


@router.delete("/lists/{list_id}/share", status_code=204)
async def unshare_list(
    list_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Take the link back: it opens nothing from now on."""
    row = _own_list(db, current_user, list_id)
    share = db.query(BookListShare).filter(BookListShare.list_id == row.id).first()
    if share is not None and share.revoked_at is None:
        share.revoked_at = datetime.now(timezone.utc)  # type: ignore[assignment]
        db.commit()


@router.get("/shared/{token}", response_model=SharedList)
async def shared_list(token: str, db: Session = Depends(get_db)):
    """The page behind a sent link. Public: titles, plays, writers, running
    times, the actor's first name. Never the words of a speech, and nothing
    the actor has taken out of their Book."""
    share = db.query(BookListShare).filter(BookListShare.token == token, BookListShare.revoked_at.is_(None)).first()
    if share is None:
        raise HTTPException(status_code=404, detail="This list is not shared")
    row = db.query(BookList).filter(BookList.id == share.list_id, BookList.deleted_at.is_(None)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="This list is not shared")
    owner = db.query(User).filter(User.id == row.user_id).first()
    first = ((owner.name or "").strip().split() or [None])[0] if owner else None

    speeches = (
        db.query(BookListItem, Monologue, Play)
        .join(Monologue, Monologue.id == BookListItem.monologue_id)
        .join(Play, Play.id == Monologue.play_id)
        .join(
            MonologueFavorite,
            (MonologueFavorite.monologue_id == BookListItem.monologue_id)
            & (MonologueFavorite.user_id == row.user_id)
            & MonologueFavorite.removed_at.is_(None),
        )
        .filter(BookListItem.list_id == row.id)
        .all()
    )
    sides = (
        db.query(BookListItem, UserScript)
        .join(UserScript, UserScript.id == BookListItem.user_script_id)
        .filter(
            BookListItem.list_id == row.id,
            or_(UserScript.processing_status.is_(None), UserScript.processing_status != _SCRIPT_DELETED),
        )
        .all()
    )
    items = sorted(
        [(i.position, i.id, SharedItem(
            kind="speech", title=str(m.title), character=str(m.character_name), work=str(p.title),
            author=str(p.author) if p.author else None,
            minutes=round((m.estimated_duration_seconds or 0) / 60, 1) or None,
        )) for i, m, p in speeches]
        + [(i.position, i.id, SharedItem(kind="sides", title=str(s.title), author=str(s.author) if s.author else None)) for i, s in sides],
        key=lambda t: (t[0], t[1]),
    )
    return SharedList(title=str(row.title), by=first, items=[t[2] for t in items])
