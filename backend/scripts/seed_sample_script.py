"""
Seed the sample/demo scripts into the database.

These are system-wide demo scripts (user_id=NULL, is_sample=True) that every
user can see and rehearse without using quota. Each is keyed by title and
seeded idempotently, so re-running adds any new demos without duplicating
existing ones.

Demos:
  - "The Breakup"  — a short contemporary two-person scene (1 scene)
  - "Hamlet"       — Shakespeare; two iconic two-handers (2 scenes)

Run:
    python backend/scripts/seed_sample_script.py
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Play, UserScript, Scene, SceneLine


def _add_lines(db, scene, lines):
    """Create SceneLine rows for a scene from (character, text, direction) tuples."""
    for i, (character, text, direction) in enumerate(lines):
        db.add(
            SceneLine(
                scene_id=scene.id,
                line_order=i,
                character_name=character,
                text=text,
                stage_direction=f"[{direction}]" if direction else None,
                word_count=len(text.split()),
            )
        )


def seed_breakup(db):
    """A short contemporary two-person scene. One scene."""
    if db.query(UserScript).filter(
        UserScript.is_sample == True, UserScript.title == "The Breakup"
    ).first():
        print('Demo "The Breakup" already exists. Skipping.')
        return

    play = Play(
        title="The Breakup",
        author="Sample Script",
        genre="drama",
        category="contemporary",
        copyright_status="public_domain",
    )
    db.add(play)
    db.flush()

    script = UserScript(
        user_id=None,
        is_sample=True,
        title="The Breakup",
        author="Sample Script",
        description="A short two-person scene for testing ScenePartner. Try rehearsing as Jordan or Sam.",
        original_filename="sample_script.txt",
        file_type="txt",
        file_size_bytes=0,
        raw_text=BREAKUP_TEXT,
        characters=[
            {"name": "JORDAN", "gender": "neutral"},
            {"name": "SAM", "gender": "neutral"},
        ],
        processing_status="completed",
        ai_extraction_completed=True,
        genre="drama",
        num_characters=2,
        num_scenes_extracted=1,
    )
    db.add(script)
    db.flush()

    scene = Scene(
        play_id=play.id,
        user_script_id=script.id,
        title="The Breakup",
        scene_number="1",
        description="A couple confronts the distance growing between them.",
        character_1_name="JORDAN",
        character_2_name="SAM",
        character_1_gender="neutral",
        character_2_gender="neutral",
        line_count=12,
        estimated_duration_seconds=90,
        difficulty_level="beginner",
        primary_emotions=["tension", "sadness", "vulnerability"],
        relationship_dynamic="romantic",
        tone="dramatic",
    )
    db.add(scene)
    db.flush()

    _add_lines(db, scene, [
        ("JORDAN", "We need to talk.", None),
        ("SAM", "I know.", "sighs"),
        ("JORDAN", "I've been thinking about us. About where we're going.", None),
        ("SAM", "Where do you think we're going?", None),
        ("JORDAN", "I don't know anymore. That's the problem. You're never here. When you are, you're on your phone.", None),
        ("SAM", "I'm trying to build something. You knew that when we started.", None),
        ("JORDAN", "I did. But I didn't know I'd be alone in the same room as you.", None),
        ("SAM", "That's not fair.", None),
        ("JORDAN", "When was the last time you looked at me? Really looked?", None),
        ("SAM", "I'm looking now.", "quietly"),
        ("JORDAN", "It's too late for that.", None),
    ])

    print(f"Demo \"The Breakup\" seeded (script_id={script.id}, scene_id={scene.id}).")


def seed_hamlet(db):
    """Shakespeare's Hamlet — two iconic two-person scenes."""
    if db.query(UserScript).filter(
        UserScript.is_sample == True, UserScript.title == "Hamlet"
    ).first():
        print('Demo "Hamlet" already exists. Skipping.')
        return

    play = Play(
        title="Hamlet",
        author="William Shakespeare",
        genre="tragedy",
        category="classical",
        copyright_status="public_domain",
    )
    db.add(play)
    db.flush()

    script = UserScript(
        user_id=None,
        is_sample=True,
        title="Hamlet",
        author="William Shakespeare",
        description="Two iconic two-person scenes from Shakespeare's tragedy. Rehearse Hamlet opposite Ophelia or Gertrude.",
        original_filename="hamlet.txt",
        file_type="txt",
        file_size_bytes=0,
        raw_text=HAMLET_TEXT,
        characters=[
            {"name": "HAMLET", "gender": "male"},
            {"name": "OPHELIA", "gender": "female"},
            {"name": "QUEEN GERTRUDE", "gender": "female"},
        ],
        processing_status="completed",
        ai_extraction_completed=True,
        genre="tragedy",
        num_characters=3,
        num_scenes_extracted=2,
    )
    db.add(script)
    db.flush()

    # Scene 1 — The Nunnery Scene (Hamlet & Ophelia)
    nunnery = Scene(
        play_id=play.id,
        user_script_id=script.id,
        title="The Nunnery Scene",
        act="Act 3",
        scene_number="1",
        description="Hamlet, feigning madness, turns on Ophelia and renounces love.",
        character_1_name="HAMLET",
        character_2_name="OPHELIA",
        character_1_gender="male",
        character_2_gender="female",
        line_count=12,
        estimated_duration_seconds=120,
        difficulty_level="advanced",
        primary_emotions=["bitterness", "grief", "anguish"],
        relationship_dynamic="romantic",
        tone="tragic",
        setting="A room in the castle, Elsinore.",
    )
    db.add(nunnery)
    db.flush()

    _add_lines(db, nunnery, [
        ("OPHELIA", "Good my lord, how does your honour for this many a day?", None),
        ("HAMLET", "I humbly thank you; well, well, well.", None),
        ("OPHELIA", "My lord, I have remembrances of yours, that I have longed long to re-deliver. I pray you, now receive them.", None),
        ("HAMLET", "No, not I; I never gave you aught.", None),
        ("OPHELIA", "My honour'd lord, you know right well you did, and with them words of so sweet breath composed as made the things more rich.", None),
        ("HAMLET", "Ha, ha! are you honest?", None),
        ("OPHELIA", "My lord?", None),
        ("HAMLET", "Are you fair?", None),
        ("OPHELIA", "What means your lordship?", None),
        ("HAMLET", "Get thee to a nunnery: why wouldst thou be a breeder of sinners?", None),
        ("OPHELIA", "Heavenly powers, restore him!", None),
        ("HAMLET", "I have heard of your paintings too, well enough. To a nunnery, go.", None),
    ])

    # Scene 2 — The Closet Scene (Hamlet & Gertrude)
    closet = Scene(
        play_id=play.id,
        user_script_id=script.id,
        title="The Closet Scene",
        act="Act 3",
        scene_number="4",
        description="Hamlet confronts his mother in her chamber over his father's death.",
        character_1_name="HAMLET",
        character_2_name="QUEEN GERTRUDE",
        character_1_gender="male",
        character_2_gender="female",
        line_count=12,
        estimated_duration_seconds=120,
        difficulty_level="advanced",
        primary_emotions=["fury", "betrayal", "grief"],
        relationship_dynamic="familial",
        tone="tragic",
        setting="The Queen's closet, Elsinore.",
    )
    db.add(closet)
    db.flush()

    _add_lines(db, closet, [
        ("QUEEN GERTRUDE", "Hamlet, thou hast thy father much offended.", None),
        ("HAMLET", "Mother, you have my father much offended.", None),
        ("QUEEN GERTRUDE", "Come, come, you answer with an idle tongue.", None),
        ("HAMLET", "Go, go, you question with a wicked tongue.", None),
        ("QUEEN GERTRUDE", "Why, how now, Hamlet!", None),
        ("HAMLET", "What's the matter now?", None),
        ("QUEEN GERTRUDE", "Have you forgot me?", None),
        ("HAMLET", "No, by the rood, not so: you are the queen, your husband's brother's wife; and, would it were not so, you are my mother.", None),
        ("QUEEN GERTRUDE", "Nay, then, I'll set those to you that can speak.", None),
        ("HAMLET", "Come, come, and sit you down; you shall not budge; you go not till I set you up a glass where you may see the inmost part of you.", None),
        ("QUEEN GERTRUDE", "What wilt thou do? thou wilt not murder me?", "afraid"),
        ("HAMLET", "Leave wringing of your hands. Peace! sit you down, and let me wring your heart.", None),
    ])

    print(
        f"Demo \"Hamlet\" seeded (script_id={script.id}, "
        f"nunnery_scene_id={nunnery.id}, closet_scene_id={closet.id})."
    )


def seed_sample_scripts():
    db = SessionLocal()
    try:
        seed_breakup(db)
        seed_hamlet(db)
        db.commit()
        print("Demo scripts seeded successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding demo scripts: {e}")
        raise
    finally:
        db.close()


BREAKUP_TEXT = """THE BREAKUP
A short scene. Author: Sample Script.

JORDAN
We need to talk.

SAM
[sighs] I know.

JORDAN
I've been thinking about us. About where we're going.

SAM
Where do you think we're going?

JORDAN
I don't know anymore. That's the problem. You're never here. When you are, you're on your phone.

SAM
I'm trying to build something. You knew that when we started.

JORDAN
I did. But I didn't know I'd be alone in the same room as you.

SAM
That's not fair.

JORDAN
When was the last time you looked at me? Really looked?

SAM
[quietly] I'm looking now.

JORDAN
It's too late for that.
"""


HAMLET_TEXT = """HAMLET, PRINCE OF DENMARK
by William Shakespeare

ACT III, SCENE 1 — THE NUNNERY SCENE

OPHELIA
Good my lord, how does your honour for this many a day?

HAMLET
I humbly thank you; well, well, well.

OPHELIA
My lord, I have remembrances of yours, that I have longed long to re-deliver. I pray you, now receive them.

HAMLET
No, not I; I never gave you aught.

OPHELIA
My honour'd lord, you know right well you did, and with them words of so sweet breath composed as made the things more rich.

HAMLET
Ha, ha! are you honest?

OPHELIA
My lord?

HAMLET
Are you fair?

OPHELIA
What means your lordship?

HAMLET
Get thee to a nunnery: why wouldst thou be a breeder of sinners?

OPHELIA
Heavenly powers, restore him!

HAMLET
I have heard of your paintings too, well enough. To a nunnery, go.


ACT III, SCENE 4 — THE CLOSET SCENE

QUEEN GERTRUDE
Hamlet, thou hast thy father much offended.

HAMLET
Mother, you have my father much offended.

QUEEN GERTRUDE
Come, come, you answer with an idle tongue.

HAMLET
Go, go, you question with a wicked tongue.

QUEEN GERTRUDE
Why, how now, Hamlet!

HAMLET
What's the matter now?

QUEEN GERTRUDE
Have you forgot me?

HAMLET
No, by the rood, not so: you are the queen, your husband's brother's wife; and, would it were not so, you are my mother.

QUEEN GERTRUDE
Nay, then, I'll set those to you that can speak.

HAMLET
Come, come, and sit you down; you shall not budge; you go not till I set you up a glass where you may see the inmost part of you.

QUEEN GERTRUDE
[afraid] What wilt thou do? thou wilt not murder me?

HAMLET
Leave wringing of your hands. Peace! sit you down, and let me wring your heart.
"""


if __name__ == "__main__":
    seed_sample_scripts()
