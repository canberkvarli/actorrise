#!/usr/bin/env python
"""
Seed film_tv_sources and film_tv_monologues with well-known audition pieces.

Metadata only; no script text. Descriptions are original thematic summaries.
Run after add_film_tv_tables.py.

Usage (from backend directory):
    uv run python scripts/seed_film_tv_monologues.py

Idempotent: clears film_tv_monologues and film_tv_sources then reseeds.
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.core.database import SessionLocal
from app.models.actor import FilmTvMonologue, FilmTvSource
from app.services.ai.content_analyzer import ContentAnalyzer
# pylint: enable=wrong-import-position


# (title, type, year, director, studio, genre[], imdb_id)
# pylint: disable=line-too-long
SOURCES = [
    ("The Dark Knight", "film", 2008, "Christopher Nolan", "Warner Bros.", ["action", "crime", "drama"], "tt0468569"),
    ("Good Will Hunting", "film", 1997, "Gus Van Sant", "Miramax", ["drama"], "tt0119217"),
    ("The Devil Wears Prada", "film", 2006, "David Frankel", "20th Century Fox", ["comedy", "drama"], "tt0458352"),
    ("A Few Good Men", "film", 1992, "Rob Reiner", "Columbia", ["drama", "thriller"], "tt0104257"),
    ("Pulp Fiction", "film", 1994, "Quentin Tarantino", "Miramax", ["crime", "drama"], "tt0110912"),
    ("The Social Network", "film", 2010, "David Fincher", "Columbia", ["biography", "drama"], "tt1285016"),
    ("Breaking Bad", "tv_series", 2008, "Vince Gilligan", "AMC", ["crime", "drama", "thriller"], "tt0903747"),
    ("Succession", "tv_series", 2018, "Jesse Armstrong", "HBO", ["drama", "comedy"], "tt7660850"),
    ("The Crown", "tv_series", 2016, "Peter Morgan", "Netflix", ["biography", "drama", "history"], "tt4786824"),
    ("Fleabag", "tv_series", 2016, "Phoebe Waller-Bridge", "BBC", ["comedy", "drama"], "tt5687612"),
    ("Network", "film", 1976, "Sidney Lumet", "MGM", ["drama"], "tt0074958"),
    ("Glengarry Glen Ross", "film", 1992, "James Foley", "New Line", ["drama", "crime"], "tt0104348"),
    ("Jerry Maguire", "film", 1996, "Cameron Crowe", "TriStar", ["comedy", "drama", "romance"], "tt0116695"),
    ("When Harry Met Sally", "film", 1989, "Rob Reiner", "Columbia", ["comedy", "drama", "romance"], "tt0098635"),
    ("12 Angry Men", "film", 1957, "Sidney Lumet", "Orion-Nova", ["drama"], "tt0050083"),
    ("To Kill a Mockingbird", "film", 1962, "Robert Mulligan", "Universal", ["drama", "crime"], "tt0056592"),
    ("The Godfather", "film", 1972, "Francis Ford Coppola", "Paramount", ["crime", "drama"], "tt0068646"),
    ("Dead Poets Society", "film", 1989, "Peter Weir", "Touchstone", ["comedy", "drama"], "tt0097165"),
    ("American Beauty", "film", 1999, "Sam Mendes", "DreamWorks", ["drama"], "tt0169547"),
    ("The Shawshank Redemption", "film", 1994, "Frank Darabont", "Columbia", ["drama"], "tt0111161"),
    ("Fences", "film", 2016, "Denzel Washington", "Paramount", ["drama"], "tt2671706"),
    ("Doubt", "film", 2008, "John Patrick Shanley", "Miramax", ["drama"], "tt0912592"),
    ("August: Osage County", "film", 2013, "John Wells", "Weinstein", ["comedy", "drama"], "tt1322269"),
    ("The West Wing", "tv_series", 1999, "Aaron Sorkin", "NBC", ["drama"], "tt0200276"),
    ("Mad Men", "tv_series", 2007, "Matthew Weiner", "AMC", ["drama"], "tt0804503"),
    ("The Queen", "film", 2006, "Stephen Frears", "Pathé", ["biography", "drama"], "tt0436697"),
    ("Spotlight", "film", 2015, "Tom McCarthy", "Open Road", ["biography", "crime", "drama"], "tt1895587"),
    ("Molly's Game", "film", 2017, "Aaron Sorkin", "STX", ["biography", "crime", "drama"], "tt4209788"),
    ("Marriage Story", "film", 2019, "Noah Baumbach", "Netflix", ["drama"], "tt7653254"),
    ("Lady Bird", "film", 2017, "Greta Gerwig", "A24", ["comedy", "drama"], "tt4925292"),
    ("The Big Short", "film", 2015, "Adam McKay", "Paramount", ["biography", "comedy", "drama"], "tt1596363"),
]

# Each tuple: (source_key, character_name, actor_name, description, themes[], primary_emotion, tone[], duration_sec, word_count_approx, character_gender, character_age_range, difficulty_level, scene_description, timestamp_approx, script_url, youtube_url)
# source_key = index in SOURCES (0-based)
# Descriptions are ORIGINAL thematic summaries; no script text.
MONOLOGUES = [
    (0, "The Joker", "Heath Ledger", "A villain explains his nihilistic worldview and the futility of order in a chaotic world.", ["chaos", "morality", "power"], "anger", ["dark", "menacing", "philosophical"], 120, 280, "male", "30s", "advanced", "Hospital scene where Joker visits Harvey Dent", "~1:45:00", "https://imsdb.com/Movie%20Scripts/Dark%20Knight,%20The%20Script.html", None),
    (1, "Will Hunting", "Matt Damon", "A young genius confronts his fear of intimacy and vulnerability with his therapist.", ["trauma", "identity", "connection"], "sadness", ["dramatic", "raw", "emotional"], 90, 220, "male", "20s", "intermediate", "Therapy session breakthrough", None, "https://imsdb.com/Movie%20Scripts/Good%20Will%20Hunting%20Script.html", None),
    (1, "Sean Maguire", "Robin Williams", "A therapist shares a personal story about love and loss to connect with a resistant patient.", ["love", "loss", "vulnerability"], "sadness", ["warm", "philosophical", "tender"], 75, 180, "male", "50s", "intermediate", "Park bench therapy session", None, "https://imsdb.com/Movie%20Scripts/Good%20Will%20Hunting%20Script.html", None),
    (2, "Miranda Priestly", "Meryl Streep", "A powerful editor dismisses an employee with cold precision while making a point about fashion and choice.", ["power", "ambition", "judgment"], "anger", ["cold", "sarcastic", "authoritative"], 60, 140, "female", "50s", "advanced", "Office confrontation about the blue sweater", None, "https://imsdb.com/Movie%20Scripts/Devil%20Wears%20Prada,%20The%20Script.html", None),
    (3, "Col. Nathan Jessup", "Jack Nicholson", "A military officer defends his actions and challenges the courtroom to accept the necessity of harsh discipline.", ["duty", "power", "morality"], "anger", ["intense", "confrontational", "authoritative"], 120, 300, "male", "50s", "advanced", "Courtroom cross-examination", "~2:00:00", "https://imsdb.com/Movie%20Scripts/Few%20Good%20Men,%20A%20Script.html", None),
    (3, "Lt. Daniel Kaffee", "Tom Cruise", "A young lawyer finds his spine and confronts a superior officer in court.", ["justice", "courage", "integrity"], "anger", ["tense", "dramatic", "triumphant"], 90, 200, "male", "20s", "intermediate", "Courtroom climax", None, "https://imsdb.com/Movie%20Scripts/Few%20Good%20Men,%20A%20Script.html", None),
    (4, "Jules Winnfield", "Samuel L. Jackson", "A hitman delivers a philosophical speech about divine intervention before a violent act.", ["morality", "fate", "violence"], "anger", ["intense", "biblical", "darkly comic"], 90, 250, "male", "30s", "advanced", "Apartment before the shooting", None, "https://imsdb.com/Movie%20Scripts/Pulp%20Fiction%20Script.html", None),
    (4, "Mia Wallace", "Uma Thurman", "A gangster's wife describes a failed pilot and the fine line between awkward and magical moments.", ["performance", "vulnerability", "connection"], "joy", ["wry", "comedic", "charming"], 75, 180, "female", "20s", "intermediate", "Diner conversation", None, "https://imsdb.com/Movie%20Scripts/Pulp%20Fiction%20Script.html", None),
    (5, "Eduardo Saverin", "Andrew Garfield", "A co-founder confronts his friend about betrayal and the dissolution of their partnership.", ["betrayal", "friendship", "business"], "anger", ["hurt", "accusatory", "emotional"], 90, 220, "male", "20s", "intermediate", "Office confrontation", None, "https://imsdb.com/Movie%20Scripts/Social%20Network,%20The%20Script.html", None),
    (5, "Mark Zuckerberg", "Jesse Eisenberg", "A founder deflects and rationalizes his behavior in a deposition.", ["ambition", "ruthlessness", "isolation"], "sadness", ["cold", "defensive", "fast"], 60, 150, "male", "20s", "advanced", "Deposition room", None, "https://imsdb.com/Movie%20Scripts/Social%20Network,%20The%20Script.html", None),
    (6, "Walter White", "Bryan Cranston", "A man justifies his descent into crime by claiming he is doing it for his family.", ["power", "rationalization", "moral decay"], "anger", ["dark", "desperate", "defiant"], 90, 220, "male", "50s", "advanced", "Basement or confrontation scene", None, None, None),
    (6, "Jesse Pinkman", "Aaron Paul", "A young man grapples with guilt and trauma after violence.", ["guilt", "trauma", "redemption"], "sadness", ["raw", "emotional", "vulnerable"], 75, 180, "male", "20s", "intermediate", "Emotional breakdown", None, None, None),
    (7, "Logan Roy", "Brian Cox", "A patriarch asserts control and dismisses his children's ambitions.", ["power", "family", "legacy"], "anger", ["authoritative", "cutting", "cold"], 90, 200, "male", "70s", "advanced", "Boardroom or family gathering", None, None, None),
    (7, "Kendall Roy", "Jeremy Strong", "A son tries to prove himself to his father in a public forum.", ["approval", "ambition", "failure"], "sadness", ["desperate", "emotional", "performative"], 120, 280, "male", "30s", "advanced", "Press conference or eulogy", None, None, None),
    (7, "Shiv Roy", "Sarah Snook", "A daughter negotiates power and loyalty within a toxic family.", ["power", "gender", "loyalty"], "anger", ["sharp", "strategic", "emotional"], 75, 180, "female", "30s", "advanced", "Family or boardroom", None, None, None),
    (8, "Queen Elizabeth II", "Claire Foy / Olivia Colman", "A monarch reflects on duty and the weight of the crown.", ["duty", "identity", "sacrifice"], "sadness", ["restrained", "regal", "emotional"], 90, 200, "female", "30s-90s", "advanced", "Private moment or address", None, None, None),
    (9, "Fleabag", "Phoebe Waller-Bridge", "A woman breaks the fourth wall to confess her grief and self-destructive behavior.", ["grief", "guilt", "sexuality"], "sadness", ["comedic", "raw", "breaking fourth wall"], 90, 220, "female", "30s", "advanced", "Direct address to camera", None, None, None),
    (10, "Howard Beale", "Peter Finch", "A news anchor urges viewers to get mad at the state of the world in a prophetic rant.", ["media", "anger", "society"], "anger", ["prophetic", "frenzied", "iconic"], 120, 300, "male", "50s", "advanced", "Live broadcast", "~1:30:00", "https://imsdb.com/Movie%20Scripts/Network%20Script.html", None),
    (11, "Blake", "Alec Baldwin", "A corporate enforcer motivates salesmen with brutal language and a winner-take-all philosophy.", ["competition", "ruthlessness", "motivation"], "anger", ["aggressive", "charismatic", "darkly comic"], 90, 250, "male", "40s", "advanced", "Sales office", None, "https://imsdb.com/Movie%20Scripts/Glengarry%20Glen%20Ross%20Script.html", None),
    (11, "Shelley Levene", "Jack Lemmon", "A desperate salesman pleads for leads and a chance to save his career.", ["desperation", "pride", "failure"], "fear", ["desperate", "pathetic", "emotional"], 75, 180, "male", "50s", "advanced", "Office with Williamson", None, "https://imsdb.com/Movie%20Scripts/Glengarry%20Glen%20Ross%20Script.html", None),
    (12, "Jerry Maguire", "Tom Cruise", "A sports agent has an emotional breakthrough and declares his need for connection.", ["vulnerability", "love", "integrity"], "joy", ["emotional", "triumphant", "sincere"], 75, 180, "male", "30s", "intermediate", "Office with Dorothy", None, "https://imsdb.com/Movie%20Scripts/Jerry%20Maguire%20Script.html", None),
    (13, "Harry Burns", "Billy Crystal", "A man argues that men and women cannot be friends because of sexual attraction.", ["friendship", "romance", "gender"], "joy", ["wry", "comedic", "conversational"], 60, 150, "male", "30s", "beginner", "Diner conversation", None, "https://imsdb.com/Movie%20Scripts/When%20Harry%20Met%20Sally%20Script.html", None),
    (13, "Sally Albright", "Meg Ryan", "A woman processes a breakup and insists on the validity of her feelings.", ["heartbreak", "validation", "friendship"], "sadness", ["comedic", "emotional", "relatable"], 60, 140, "female", "30s", "beginner", "Restaurant with Harry", None, "https://imsdb.com/Movie%20Scripts/When%20Harry%20Met%20Sally%20Script.html", None),
    (14, "Juror 8", "Henry Fonda", "A juror argues for reasonable doubt and the importance of deliberation.", ["justice", "doubt", "integrity"], "hope", ["calm", "persuasive", "moral"], 90, 220, "male", "40s", "intermediate", "Jury room", None, "https://imsdb.com/Movie%20Scripts/12%20Angry%20Men%20Script.html", None),
    (14, "Juror 3", "Lee J. Cobb", "A juror's rage and personal bias erupt during deliberation.", ["anger", "prejudice", "projection"], "anger", ["explosive", "emotional", "confrontational"], 75, 180, "male", "50s", "advanced", "Jury room", None, "https://imsdb.com/Movie%20Scripts/12%20Angry%20Men%20Script.html", None),
    (15, "Atticus Finch", "Gregory Peck", "A lawyer argues for justice and equality in a closing argument to the jury.", ["justice", "morality", "race"], "hope", ["earnest", "moral", "powerful"], 120, 280, "male", "40s", "advanced", "Courtroom closing argument", None, "https://imsdb.com/Movie%20Scripts/To%20Kill%20a%20Mockingbird%20Script.html", None),
    (16, "Michael Corleone", "Al Pacino", "A successor to a crime family asserts his new authority and cold resolve.", ["power", "family", "transformation"], "anger", ["cold", "authoritative", "tragic"], 90, 200, "male", "30s", "advanced", "Office or family gathering", None, "https://imsdb.com/Movie%20Scripts/Godfather,%20The%20Script.html", None),
    (17, "John Keating", "Robin Williams", "A teacher inspires students to seize the day and think for themselves.", ["education", "individuality", "carpe diem"], "joy", ["inspiring", "warm", "philosophical"], 90, 220, "male", "40s", "intermediate", "Classroom", None, "https://imsdb.com/Movie%20Scripts/Dead%20Poets%20Society%20Script.html", None),
    (18, "Lester Burnham", "Kevin Spacey", "A man in midlife crisis narrates his disillusionment and desire for change.", ["disillusionment", "desire", "rebellion"], "sadness", ["wry", "dark", "narrative"], 75, 180, "male", "40s", "advanced", "Voiceover or direct address", None, "https://imsdb.com/Movie%20Scripts/American%20Beauty%20Script.html", None),
    (19, "Andy Dufresne", "Tim Robbins", "A prisoner describes hope and the importance of inner freedom.", ["hope", "freedom", "perseverance"], "hope", ["philosophical", "calm", "inspiring"], 90, 200, "male", "30s", "intermediate", "Prison yard or narration", None, "https://imsdb.com/Movie%20Scripts/Shawshank%20Redemption,%20The%20Script.html", None),
    (20, "Troy Maxson", "Denzel Washington", "A father confronts his son about responsibility and the barriers he faced.", ["fatherhood", "race", "responsibility"], "anger", ["intense", "emotional", "authoritative"], 120, 280, "male", "50s", "advanced", "Yard or kitchen", None, "https://imsdb.com/Movie%20Scripts/Fences%20Script.html", None),
    (21, "Sister Aloysius", "Meryl Streep", "A nun expresses her certainty about a priest's wrongdoing and the need to act.", ["certainty", "morality", "power"], "anger", ["stern", "determined", "moral"], 90, 220, "female", "60s", "advanced", "Office or garden", None, "https://imsdb.com/Movie%20Scripts/Doubt%20Script.html", None),
    (21, "Father Flynn", "Philip Seymour Hoffman", "A priest defends himself and speaks about doubt and grace.", ["doubt", "innocence", "faith"], "sadness", ["passionate", "defensive", "emotional"], 75, 180, "male", "40s", "advanced", "Pulpit or office", None, "https://imsdb.com/Movie%20Scripts/Doubt%20Script.html", None),
    (22, "Violet Weston", "Meryl Streep", "A matriarch dominates her family with cruelty and truth-telling at a family gathering.", ["family", "truth", "control"], "anger", ["sharp", "toxic", "comedic"], 90, 220, "female", "60s", "advanced", "Dinner table", None, "https://imsdb.com/Movie%20Scripts/August%20Osage%20County%20Script.html", None),
    (23, "President Josiah Bartlet", "Martin Sheen", "A president confronts hypocrisy and speaks about faith and leadership.", ["faith", "leadership", "integrity"], "anger", ["eloquent", "moral", "powerful"], 90, 220, "male", "50s", "advanced", "Oval Office or church", None, None, None),
    (24, "Don Draper", "Jon Hamm", "A man sells an idea or reflects on identity and the past.", ["identity", "advertising", "past"], "sadness", ["smooth", "melancholic", "charismatic"], 90, 200, "male", "40s", "advanced", "Pitch or personal moment", None, None, None),
    (25, "Queen Elizabeth II", "Helen Mirren", "The monarch reflects on tradition and change in a moment of crisis.", ["duty", "tradition", "change"], "sadness", ["restrained", "regal", "emotional"], 75, 180, "female", "80s", "advanced", "Private audience", None, "https://imsdb.com/Movie%20Scripts/Queen,%20The%20Script.html", None),
    (26, "Marty Baron", "Liev Schreiber", "An editor pushes his team to pursue a difficult story with moral clarity.", ["journalism", "integrity", "leadership"], "hope", ["calm", "authoritative", "moral"], 60, 150, "male", "50s", "intermediate", "Newsroom", None, "https://imsdb.com/Movie%20Scripts/Spotlight%20Script.html", None),
    (27, "Molly Bloom", "Jessica Chastain", "A woman tells the story of her rise and fall in high-stakes poker.", ["ambition", "survival", "narrative"], "sadness", ["wry", "confessional", "driven"], 120, 280, "female", "30s", "advanced", "Opening or courtroom", None, "https://imsdb.com/Movie%20Scripts/Mollys%20Game%20Script.html", None),
    (28, "Charlie Barber", "Adam Driver", "A man in a divorce expresses his pain and sense of being unheard.", ["divorce", "grief", "communication"], "anger", ["raw", "emotional", "accusatory"], 120, 280, "male", "30s", "advanced", "Therapy or confrontation", None, None, None),
    (28, "Nicole Barber", "Scarlett Johansson", "A woman articulates why she left and what she needed from the relationship.", ["divorce", "identity", "need"], "sadness", ["emotional", "clear", "hurt"], 90, 220, "female", "30s", "advanced", "Therapy or confrontation", None, None, None),
    (29, "Christine McPherson", "Saoirse Ronan", "A teenager clashes with her mother about her future and identity.", ["mother-daughter", "identity", "escape"], "anger", ["raw", "comedic", "emotional"], 75, 180, "female", "teens", "intermediate", "Car or home", None, "https://imsdb.com/Movie%20Scripts/Lady%20Bird%20Script.html", None),
    (30, "Jared Vennett", "Ryan Gosling", "A banker breaks the fourth wall to explain complex finance with dark humor.", ["finance", "greed", "narrative"], "joy", ["comedic", "charismatic", "breaking fourth wall"], 90, 220, "male", "30s", "advanced", "Direct address / narration", None, "https://imsdb.com/Movie%20Scripts/Big%20Short,%20The%20Script.html", None),
]
# pylint: enable=line-too-long


def main() -> None:
    db = SessionLocal()
    analyzer = ContentAnalyzer()
    try:
        print("Clearing existing film/TV data...")
        db.query(FilmTvMonologue).delete()
        db.query(FilmTvSource).delete()
        db.commit()
        print("Creating sources...")
        source_rows = []
        for t in SOURCES:
            title, stype, year, director, studio, genre, imdb_id = t
            s = FilmTvSource(
                title=title,
                type=stype,
                year=year,
                director=director,
                studio=studio,
                genre=genre,
                imdb_id=imdb_id,
            )
            db.add(s)
            db.flush()
            source_rows.append(s)
        print(f"  Created {len(source_rows)} sources.")
        print("Creating monologues with embeddings...")
        for i, m in enumerate(MONOLOGUES):
            src_idx, char_name, actor_name, desc, themes, emotion, tone, dur, wc, gender, age, diff, scene_desc, ts_approx, script_url, yt_url = m
            source = source_rows[src_idx]
            text_for_embedding = (
                f"{char_name} from {source.title}: {desc} "
                f"{' '.join(themes or [])}"
            )
            embedding = analyzer.generate_embedding(text_for_embedding)
            mono = FilmTvMonologue(
                source_id=source.id,
                character_name=char_name,
                actor_name=actor_name,
                description=desc,
                themes=themes,
                primary_emotion=emotion,
                tone=tone,
                estimated_duration_seconds=dur,
                word_count_approx=wc,
                character_gender=gender,
                character_age_range=age,
                difficulty_level=diff,
                scene_description=scene_desc,
                timestamp_approx=ts_approx,
                script_url=script_url,
                youtube_url=yt_url,
                embedding=embedding if embedding else None,
                copyright_status="copyrighted",
                content_hosted=False,
            )
            db.add(mono)
            if (i + 1) % 10 == 0:
                print(f"  Processed {i + 1}/{len(MONOLOGUES)}...")
        db.commit()
        print(f"  Created {len(MONOLOGUES)} monologues with embeddings.")
    finally:
        db.close()
    print("Done.")


if __name__ == "__main__":
    main()
