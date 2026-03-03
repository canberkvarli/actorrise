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
        "name": "Jeanielle Ettinoffe",
        "slug": "jeanielle-ettinoffe",
        "descriptor": "Actor",
        "quote": (
            "ActorRise has honestly been such a game changer for me. I used to spend "
            "hours searching for the perfect monologue for self tapes and still end up "
            "second guessing it. Now I can find material in minutes. The algorithm is "
            "kind of scary in the best way, it\u2019s super specific and really tailored "
            "to me and my tone. Let\u2019s be honest, AI doesn\u2019t always \"get\" "
            "actors... but this actually does, which is absolutely impeccable!!!"
        ),
        "bio": None,
        "social_links": {},
        "headshots": [
            {"url": "/testimonials/jeannille-ettinoffe/jeannille-ettinoffe.jpg", "is_primary": True, "caption": ""},
        ],
        "display_order": 2,
        "is_published": True,
        "source": "actor",
    },
]


def main():
    db = SessionLocal()
    try:
        for data in SEED_DATA:
            existing = db.query(FoundingActor).filter(FoundingActor.slug == data["slug"]).first()
            if existing:
                print(f"  Skipping {data['name']} (slug '{data['slug']}' already exists)")
                continue
            actor = FoundingActor(**data)
            db.add(actor)
            print(f"  Created {data['name']} ({data['slug']})")
        db.commit()
        print("Done. Founding actors seeded.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
