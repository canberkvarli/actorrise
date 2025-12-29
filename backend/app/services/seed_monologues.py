"""
Script to seed the database with sample monologues.
Run this after database initialization.
"""
from app.core.database import SessionLocal
from app.models.actor import Monologue
from app.services.ai import generate_monologue_embedding, format_embedding

sample_monologues = [
    {
        "title": "To Be or Not to Be",
        "author": "William Shakespeare",
        "age_range": "25-35",
        "gender": "Male",
        "genre": "Shakespeare",
        "difficulty": "Advanced",
        "excerpt": "To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer The slings and arrows of outrageous fortune...",
        "source_url": "https://www.shakespeare.org.uk",
    },
    {
        "title": "All the World's a Stage",
        "author": "William Shakespeare",
        "age_range": "35-45",
        "gender": "Male",
        "genre": "Shakespeare",
        "difficulty": "Advanced",
        "excerpt": "All the world's a stage, And all the men and women merely players; They have their exits and their entrances...",
        "source_url": "https://www.shakespeare.org.uk",
    },
    {
        "title": "The Glass Menagerie - Laura",
        "author": "Tennessee Williams",
        "age_range": "18-25",
        "gender": "Female",
        "genre": "Drama",
        "difficulty": "Intermediate",
        "excerpt": "I know I'm not pretty, but I'm not crippled. I have one leg shorter than the other...",
        "source_url": "https://www.dramatists.com",
    },
    {
        "title": "A Streetcar Named Desire - Blanche",
        "author": "Tennessee Williams",
        "age_range": "25-35",
        "gender": "Female",
        "genre": "Drama",
        "difficulty": "Advanced",
        "excerpt": "I don't want realism. I want magic! Yes, yes, magic! I try to give that to people...",
        "source_url": "https://www.dramatists.com",
    },
    {
        "title": "The Importance of Being Earnest - Gwendolen",
        "author": "Oscar Wilde",
        "age_range": "18-25",
        "gender": "Female",
        "genre": "Comedy",
        "difficulty": "Intermediate",
        "excerpt": "I am engaged to Mr. Worthing, mamma. We are not engaged, mamma. People don't marry their sisters...",
        "source_url": "https://www.gutenberg.org",
    },
    {
        "title": "Death of a Salesman - Willy",
        "author": "Arthur Miller",
        "age_range": "45-55",
        "gender": "Male",
        "genre": "Drama",
        "difficulty": "Advanced",
        "excerpt": "I'm not interested in stories about the past or any crap of that kind because the woods are burning, boys...",
        "source_url": "https://www.dramatists.com",
    },
    {
        "title": "The Crucible - John Proctor",
        "author": "Arthur Miller",
        "age_range": "35-45",
        "gender": "Male",
        "genre": "Drama",
        "difficulty": "Advanced",
        "excerpt": "Because it is my name! Because I cannot have another in my life! Because I lie and sign myself to lies!",
        "source_url": "https://www.dramatists.com",
    },
    {
        "title": "Our Town - Emily",
        "author": "Thornton Wilder",
        "age_range": "18-25",
        "gender": "Female",
        "genre": "Drama",
        "difficulty": "Intermediate",
        "excerpt": "Oh, earth, you're too wonderful for anybody to realize you. Do any human beings ever realize life while they live it?",
        "source_url": "https://www.dramatists.com",
    },
]


def seed_monologues():
    db = SessionLocal()
    try:
        # Check if monologues already exist
        existing_count = db.query(Monologue).count()
        if existing_count > 0:
            print(f"Database already has {existing_count} monologues. Skipping seed.")
            # Check if embeddings need to be generated for existing monologues
            from app.core.config import settings
            if settings.openai_api_key and settings.openai_api_key != "optional-for-mvp":
                monologues_without_embeddings = db.query(Monologue).filter(
                    Monologue.embedding.is_(None)
                ).all()
                if monologues_without_embeddings:
                    print(f"Generating embeddings for {len(monologues_without_embeddings)} monologues without embeddings...")
                    for monologue in monologues_without_embeddings:
                        embedding = generate_monologue_embedding(monologue)
                        if embedding:
                            monologue.embedding = format_embedding(embedding)
                    db.commit()
                    print("Embeddings generated successfully.")
            return

        print(f"Seeding {len(sample_monologues)} monologues...")
        for monologue_data in sample_monologues:
            monologue = Monologue(**monologue_data)
            db.add(monologue)
        
        db.commit()
        print(f"Successfully seeded {len(sample_monologues)} monologues.")
        
        # Generate embeddings for all monologues (if OpenAI is configured)
        from app.core.config import settings
        if settings.openai_api_key and settings.openai_api_key != "optional-for-mvp":
            print("Generating embeddings for monologues...")
            all_monologues = db.query(Monologue).all()
            for monologue in all_monologues:
                embedding = generate_monologue_embedding(monologue)
                if embedding:
                    monologue.embedding = format_embedding(embedding)
            
            db.commit()
            print("Embeddings generated successfully.")
        else:
            print("OpenAI API key not configured. Skipping embedding generation.")
            print("Set OPENAI_API_KEY environment variable to enable semantic search.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding monologues: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    seed_monologues()

