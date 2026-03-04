"""
Seed the founding_actors table from the hardcoded testimonials data.

Run once after deploying the new FoundingActor model:
    cd backend && python -m scripts.seed_founding_actors
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import SessionLocal
from app.models.founding_actor import FoundingActor

SEED_DATA = [
    {
        "name": "Canberk Varli",
        "slug": "canberk-varli",
        "descriptor": "Founder \u00b7 Actor",
        "quote": (
            "I have spent a lot of time searching through books and databases for "
            "the right audition piece. That work matters, but rehearsal matters more. "
            "ActorRise helps me find material quickly so I can spend more time "
            "repeating, refining, and doing the work."
        ),
        "bio": None,
        "social_links": {},
        "headshots": [
            {"url": "/testimonials/canberk/canberk.jpg", "is_primary": True, "caption": ""},
        ],
        "display_order": 0,
        "is_published": True,
        "source": "direct",
    },
    {
        "name": "Timothy Miller",
        "slug": "timothy-miller",
        "descriptor": "Actor \u00b7 Voice Actor \u00b7 Comedian",
        "quote": (
            "I\u2019m genuinely impressed by what Canberk has built with ActorRise. "
            "It\u2019s rare to find a platform that understands the actor\u2019s struggle "
            "so well. The ability to discover unique, tailored material in seconds is "
            "exactly what the industry needs right now. I\u2019m proud to support it!"
        ),
        "bio": None,
        "social_links": {},
        "headshots": [
            {"url": "/testimonials/timothy_miller/1000001409.jpg", "is_primary": True, "caption": ""},
        ],
        "display_order": 1,
        "is_published": True,
        "source": "actor",
    },
    {
        "name": "Jeannille Ettinoffe",
        "slug": "jeannille-ettinoffe",
        "descriptor": "Singer \u2b29 Actress \u2b29 Dancer \u2b29 Musician",
        "quote": (
            "ActorRise has honestly been such a game changer for me. I used to spend "
            "hours searching for the perfect monologue for self tapes and still end up "
            "second guessing it. Now I can find material in minutes. The algorithm is "
            "kind of scary in the best way, it\u2019s super specific and really tailored "
            "to me and my tone. Let\u2019s be honest, AI doesn\u2019t always \"get\" "
            "actors... but this actually does, which is absolutely impeccable!!!"
        ),
        "bio": (
            "Jeannille Ettinoffe is a quadruple threat singer, actress, dancer, and "
            "multi-instrumentalist known for her dynamic stage presence, vocal versatility, "
            "and emotionally rich storytelling. With a vocal range spanning C#3 to C#6, she "
            "brings both power and nuance to every performance, supported by skills in acting, "
            "dance, classical vocal training, and figure skating.\n\n"
            "Her recent Off-Broadway credits include Gabriella Montez in High School Musical, "
            "Annabeth Chase in The Lightning Thief, Gretchen Wieners in Mean Girls: High School "
            "Edition, Beth March in Little Women, and Narrator in Puffs. She has also appeared in "
            "Legally Blonde, The Great Gatsby, and The Mystery of Edwin Drood.\n\n"
            "In the music world, Jeannille has been a featured soloist at Carnegie Hall's "
            "Evocation of Song, NJ All-State Treble Chorus, and Bergen County Choir. She plays "
            "guitar, ukulele, piano, and flute. She is skilled in British accents (RP, Queen's "
            "English, Essex). Additionally, she can perform Australian, French, Caribbean, "
            "American (Southern), Irish, Spanish, New York, and standard American accents. She "
            "speaks fluent English and is conversational in American Sign Language (ASL).\n\n"
            "With experience in plays, musicals, dance, and stage combat, Jeannille also brings "
            "athleticism and grace from years of figure skating. Known for her professionalism, "
            "strong work ethic, and natural ability to take direction, she approaches every "
            "project with creativity, curiosity, and discipline."
        ),
        "social_links": {
            "instagram": "https://www.instagram.com/theeofficial_jeannille",
            "youtube": "https://www.youtube.com/@jeannille_music",
            "backstage": "https://www.backstage.com/u/jeannille-ettinoffe/",
            "imdb": "https://www.imdb.com/name/nm17774164/",
            "website": "https://www.jeannilleettinoffe.com",
        },
        "headshots": [
            {"url": "/testimonials/jeannille-ettinoffe/jeannille-ettinoffe.jpg", "is_primary": True, "caption": ""},
        ],
        "display_order": 2,
        "is_published": True,
        "source": "actor",
    },
]


# Old slug → new slug for records that were renamed.
SLUG_RENAMES = {
    "jeanielle-ettinoffe": "jeannille-ettinoffe",
}


def main():
    db = SessionLocal()
    try:
        for data in SEED_DATA:
            existing = db.query(FoundingActor).filter(FoundingActor.slug == data["slug"]).first()

            # Also check old slugs in case the record was created with a previous spelling.
            if not existing:
                for old_slug, new_slug in SLUG_RENAMES.items():
                    if new_slug == data["slug"]:
                        existing = db.query(FoundingActor).filter(FoundingActor.slug == old_slug).first()
                        if existing:
                            break

            if existing:
                for key, value in data.items():
                    if value is not None:
                        setattr(existing, key, value)
                print(f"  Updated {data['name']} ({data['slug']})")
            else:
                actor = FoundingActor(**data)
                db.add(actor)
                print(f"  Created {data['name']} ({data['slug']})")
        db.commit()
        print("Done. Founding actors seeded/updated.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
