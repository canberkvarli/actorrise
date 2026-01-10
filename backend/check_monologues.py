#!/usr/bin/env python3
"""Check contemporary monologues in database."""

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play

db = SessionLocal()

# Count plays by category
total_plays = db.query(Play).count()
classical_plays = db.query(Play).filter(Play.category == 'classical').count()
contemporary_plays = db.query(Play).filter(Play.category == 'contemporary').count()

# Count monologues
total_monologues = db.query(Monologue).count()
classical_monologues = db.query(Monologue).join(Play).filter(Play.category == 'classical').count()
contemporary_monologues = db.query(Monologue).join(Play).filter(Play.category == 'contemporary').count()

print("="*70)
print("DATABASE STATUS")
print("="*70)
print(f"\nPlays:")
print(f"  Total: {total_plays}")
print(f"  Classical: {classical_plays}")
print(f"  Contemporary: {contemporary_plays}")

print(f"\nMonologues:")
print(f"  Total: {total_monologues}")
print(f"  Classical: {classical_monologues}")
print(f"  Contemporary: {contemporary_monologues}")

if contemporary_monologues > 0:
    print(f"\n\nSample Contemporary Monologues:")
    print("-"*70)
    samples = db.query(Monologue).join(Play).filter(Play.category == 'contemporary').limit(5).all()
    for m in samples:
        print(f"  - {m.character_name} from '{m.play.title}' by {m.play.author}")
        print(f"    ({m.word_count} words, {m.character_gender}, {m.primary_emotion})")
else:
    print("\n⚠️  NO CONTEMPORARY MONOLOGUES FOUND IN DATABASE!")

# Check if any category=Contemporary but mismatching
print(f"\n\nChecking Play categories:")
print("-"*70)
from sqlalchemy import func
categories = db.query(Play.category, func.count(Play.id)).group_by(Play.category).all()
for cat, count in categories:
    print(f"  {cat}: {count}")

db.close()
