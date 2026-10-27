"""The class shelf: a teacher's own scripts, handed to their own class.

A teacher (account_type "educator" with a class link) switches a script they
uploaded to "Share with my class". The students who joined that teacher's
link see it in ScenePartner under "From <first name>" and rehearse the
teacher's scenes as they are: read-only, each student's runs their own. Nothing
is copied, so a typo the teacher fixes is fixed for every student.

This is the paper sides a teacher hands out, not publishing. Film and TV
dialogue belongs to the studios, so a shared script is never listed to anyone
outside the class: not in the Community library, not in search, not on a
public page, not as a count. Anyone who is not entitled gets a 404, the same
as for a script that does not exist.

Who sees a script: it is "live", its teacher owns a class link that is
switched on, and the viewer joined that link (any outcome but "full", which
means they were turned away). Switching the link off takes the shelf down;
a moderator can take one script down ("hidden") and the teacher cannot put it
back up.
"""

from __future__ import annotations

from sqlalchemy import and_, exists
from sqlalchemy.orm import Session

from app.models.actor import Scene, UserScript
from app.models.class_link import ClassLink, ClassLinkJoin
from app.models.user import User

LIVE = "live"
HIDDEN = "hidden"
# A join turned away because the link was full is not a member.
NOT_MEMBER_OUTCOMES = ("full",)
# Scripts that are still being read, failed, or sit in Recently deleted are
# not on the shelf (api/scripts.py DELETED).
READY = "completed"


class ShareRefused(Exception):
    pass


def _member_of(db: Session, student_id: int):
    """The active links this person joined, as a query of teacher ids."""
    return (
        db.query(ClassLink.teacher_user_id)
        .join(ClassLinkJoin, ClassLinkJoin.class_link_id == ClassLink.id)
        .filter(
            ClassLink.active.is_(True),
            ClassLinkJoin.user_id == student_id,
            ClassLinkJoin.outcome.notin_(NOT_MEMBER_OUTCOMES),
        )
    )


def can_read(db: Session, user: User, script: UserScript | None) -> bool:
    """Whether `user` is in the class `script` is shared with. False for the
    owner: the owner's own rights are checked where they always were."""
    if script is None or script.class_share != LIVE or script.user_id is None:
        return False
    if script.user_id == user.id or script.processing_status != READY:
        return False
    return db.query(
        exists().where(
            and_(
                ClassLink.teacher_user_id == script.user_id,
                ClassLink.active.is_(True),
                ClassLinkJoin.class_link_id == ClassLink.id,
                ClassLinkJoin.user_id == user.id,
                ClassLinkJoin.outcome.notin_(NOT_MEMBER_OUTCOMES),
            )
        )
    ).scalar()


def shelves(db: Session, user: User) -> list[dict]:
    """One shelf per teacher whose class this person is in, with the scripts
    that teacher shared and their scenes. Empty for everyone else."""
    teacher_ids = [t for (t,) in _member_of(db, user.id).distinct().all() if t != user.id]
    if not teacher_ids:
        return []
    scripts = (
        db.query(UserScript)
        .filter(
            UserScript.user_id.in_(teacher_ids),
            UserScript.class_share == LIVE,
            UserScript.processing_status == READY,
        )
        .order_by(UserScript.title.asc(), UserScript.id.asc())
        .all()
    )
    if not scripts:
        return []
    scenes_by_script: dict[int, list[Scene]] = {}
    for scene in (
        db.query(Scene)
        .filter(Scene.user_script_id.in_([s.id for s in scripts]))
        .order_by(Scene.user_script_id, Scene.id)
        .all()
    ):
        scenes_by_script.setdefault(scene.user_script_id, []).append(scene)

    # The first name the teacher's link shows on its join page: already public.
    labels: dict[int, str] = {}
    for link in (
        db.query(ClassLink)
        .filter(ClassLink.teacher_user_id.in_(teacher_ids), ClassLink.active.is_(True))
        .order_by(ClassLink.created_at.desc(), ClassLink.id.desc())
        .all()
    ):
        labels.setdefault(link.teacher_user_id, link.teacher_label)

    out: dict[int, dict] = {}
    for script in scripts:
        scenes = scenes_by_script.get(script.id) or []
        if not scenes:
            continue
        shelf = out.setdefault(
            script.user_id,
            {"teacher": labels.get(script.user_id) or "your teacher", "scripts": []},
        )
        shelf["scripts"].append(
            {
                "id": script.id,
                "title": script.title,
                "author": script.author,
                "genre": script.genre,
                "scenes": [
                    {
                        "id": sc.id,
                        "title": sc.title,
                        "character_1_name": sc.character_1_name,
                        "character_2_name": sc.character_2_name,
                        "line_count": sc.line_count,
                        "estimated_duration_seconds": sc.estimated_duration_seconds,
                    }
                    for sc in scenes
                ],
            }
        )
    return sorted(out.values(), key=lambda s: s["teacher"].lower())


def can_share(db: Session, teacher: User) -> bool:
    """Teacher accounts with a class link (on or off: an off link shows nothing
    to anyone, and sharing ahead of it being switched on is fine)."""
    if teacher.account_type != "educator":
        return False
    return db.query(ClassLink.id).filter(ClassLink.teacher_user_id == teacher.id).first() is not None


def set_shared(db: Session, teacher: User, script: UserScript, on: bool) -> UserScript:
    """The teacher's switch. Raises ShareRefused with the reason."""
    if script.user_id != teacher.id or script.is_sample:
        raise ShareRefused("Only a script you uploaded can be shared with your class.")
    if script.class_share == HIDDEN:
        raise ShareRefused("This script was taken down. Write to canberk@actorrise.com about it.")
    if on and not can_share(db, teacher):
        raise ShareRefused("Sharing is for teacher accounts with a class link.")
    script.class_share = LIVE if on else None
    db.commit()
    return script


def shared_count(db: Session, teacher: User) -> int:
    """For the teacher's own card. Never shown to anyone else."""
    return (
        db.query(UserScript.id)
        .filter(UserScript.user_id == teacher.id, UserScript.class_share == LIVE)
        .count()
    )
