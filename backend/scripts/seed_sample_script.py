"""
Seed the sample script into the database.

This creates a system-wide sample script (user_id=NULL, is_sample=True)
that all users can see and rehearse without using quota.

Run:
    python backend/scripts/seed_sample_script.py
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Play, UserScript, Scene, SceneLine


def seed_sample_script():
    db = SessionLocal()
    try:
        # Check if sample script already exists
        existing = db.query(UserScript).filter(UserScript.is_sample == True).first()
        if existing:
            print(f"Sample script already exists (id={existing.id}). Skipping.")
            return

        # Create a Play record (Scene requires play_id)
        play = Play(
            title="The Breakup",
            author="Sample Script",
            genre="drama",
            category="contemporary",
            copyright_status="public_domain",
        )
        db.add(play)
        db.flush()

        # Create the sample UserScript
        script = UserScript(
            user_id=None,
            is_sample=True,
            title="The Breakup",
            author="Sample Script",
            description="A short two-person scene for testing ScenePartner. Try rehearsing as Jordan or Sam.",
            original_filename="sample_script.txt",
            file_type="txt",
            file_size_bytes=0,
            raw_text=SCRIPT_TEXT,
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

        # Create the scene
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

        # Create dialogue lines
        lines = [
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
        ]

        for i, (character, text, direction) in enumerate(lines):
            line = SceneLine(
                scene_id=scene.id,
                line_order=i,
                character_name=character,
                text=text,
                stage_direction=f"[{direction}]" if direction else None,
                word_count=len(text.split()),
            )
            db.add(line)

        db.commit()
        print(f"Sample script seeded successfully (script_id={script.id}, scene_id={scene.id})")

    except Exception as e:
        db.rollback()
        print(f"Error seeding sample script: {e}")
        raise
    finally:
        db.close()


SCRIPT_TEXT = """THE BREAKUP
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


if __name__ == "__main__":
    seed_sample_script()
