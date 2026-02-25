"""Scrape plays from Project Gutenberg."""

import requests
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app.services.extraction.plain_text_parser import PlainTextParser
from app.models.actor import Play, Monologue


# Comprehensive list of classical playwrights and their notable works
CLASSICAL_PLAYWRIGHTS = {
    "William Shakespeare": [
        "Hamlet", "Macbeth", "Romeo and Juliet", "Othello", "King Lear",
        "A Midsummer Night's Dream", "The Tempest", "Julius Caesar",
        "Antony and Cleopatra", "Richard III", "Much Ado About Nothing",
        "As You Like It", "Twelfth Night", "The Merchant of Venice",
        "Henry V", "Richard II", "Coriolanus", "Titus Andronicus",
        "The Taming of the Shrew", "The Winter's Tale", "Measure for Measure",
        "All's Well That Ends Well", "Troilus and Cressida", "Cymbeline",
        "Pericles", "Henry IV", "Henry VI", "Henry VIII", "King John"
    ],
    "Anton Chekhov": [
        "The Seagull", "Uncle Vanya", "Three Sisters", "The Cherry Orchard",
        "Ivanov", "The Wood Demon", "The Bear", "The Proposal",
        "A Tragic Role", "Swan Song", "On the Harmfulness of Tobacco"
    ],
    "Henrik Ibsen": [
        "A Doll's House", "Hedda Gabler", "An Enemy of the People",
        "The Wild Duck", "Ghosts", "The Master Builder", "Peer Gynt",
        "Rosmersholm", "The Lady from the Sea", "John Gabriel Borkman",
        "When We Dead Awaken", "Brand", "Little Eyolf"
    ],
    "Oscar Wilde": [
        "The Importance of Being Earnest", "Lady Windermere's Fan",
        "An Ideal Husband", "A Woman of No Importance", "Salome",
        "Vera", "The Duchess of Padua"
    ],
    "George Bernard Shaw": [
        "Pygmalion", "Saint Joan", "Major Barbara", "Man and Superman",
        "Arms and the Man", "Candida", "Mrs Warren's Profession",
        "The Doctor's Dilemma", "Caesar and Cleopatra", "Heartbreak House",
        "Back to Methuselah", "The Devil's Disciple", "You Never Can Tell",
        "Androcles and the Lion", "The Philanderer"
    ],
    "Molière": [
        "Tartuffe", "The Misanthrope", "The School for Wives",
        "The Miser", "The Imaginary Invalid", "Don Juan",
        "The Bourgeois Gentleman", "The Learned Ladies", "The Doctor in Spite of Himself"
    ],
    "Sophocles": [
        "Oedipus Rex", "Antigone", "Electra", "Oedipus at Colonus",
        "Ajax", "The Women of Trachis", "Philoctetes"
    ],
    "Euripides": [
        "Medea", "The Bacchae", "Hippolytus", "The Trojan Women",
        "Electra", "Iphigenia in Aulis", "Iphigenia in Tauris",
        "Alcestis", "Andromache", "Hecuba", "Helen", "Ion",
        "Orestes", "The Phoenician Women", "The Suppliants"
    ],
    "Aeschylus": [
        "The Oresteia", "Prometheus Bound", "The Persians",
        "Seven Against Thebes", "The Suppliants"
    ],
    "August Strindberg": [
        "Miss Julie", "The Father", "The Dance of Death",
        "A Dream Play", "The Ghost Sonata", "The Creditors",
        "Easter", "To Damascus", "The Pelican"
    ],
    "Christopher Marlowe": [
        "Doctor Faustus", "Tamburlaine", "The Jew of Malta",
        "Edward II", "Dido, Queen of Carthage", "The Massacre at Paris"
    ],
    "Ben Jonson": [
        "Volpone", "The Alchemist", "Bartholomew Fair",
        "Sejanus His Fall", "Epicoene", "Every Man in His Humour",
        "Catiline His Conspiracy"
    ],
    # EXPANSION: Restoration & 18th Century (1660-1800)
    "William Congreve": [
        "The Way of the World", "Love for Love", "The Double Dealer",
        "The Old Bachelor", "The Mourning Bride"
    ],
    "Richard Brinsley Sheridan": [
        "The School for Scandal", "The Rivals", "The Critic",
        "A Trip to Scarborough", "St. Patrick's Day"
    ],
    "Oliver Goldsmith": [
        "She Stoops to Conquer", "The Good-Natured Man"
    ],
    "John Dryden": [
        "All for Love", "The Indian Queen", "The Indian Emperor",
        "Marriage à la Mode", "Aureng-Zebe"
    ],
    "William Wycherley": [
        "The Country Wife", "The Plain Dealer", "Love in a Wood",
        "The Gentleman Dancing-Master"
    ],
    # EXPANSION: 19th Century (1800-1900)
    "Arthur Wing Pinero": [
        "The Second Mrs. Tanqueray", "Trelawny of the Wells",
        "The Magistrate", "Dandy Dick", "The Notorious Mrs. Ebbsmith"
    ],
    "Victorien Sardou": [
        "La Tosca", "Fedora", "Madame Sans-Gêne", "Diplomacy"
    ],
    "Alexandre Dumas fils": [
        "The Lady of the Camellias", "The Natural Son", "The Ideas of Madame Aubray"
    ],
    # EXPANSION: Early 20th Century (1900-1927 - PUBLIC DOMAIN)
    "John Galsworthy": [
        "The Silver Box", "Strife", "Justice", "The Pigeon",
        "The Eldest Son", "The Fugitive", "The Mob", "Loyalties"
    ],
    "J.M. Barrie": [
        "Peter Pan", "The Admirable Crichton", "Quality Street",
        "What Every Woman Knows", "Dear Brutus", "Mary Rose"
    ],
    "John Millington Synge": [
        "The Playboy of the Western World", "Riders to the Sea",
        "The Shadow of the Glen", "The Well of the Saints", "Deirdre of the Sorrows"
    ],
    "Lady Gregory": [
        "The Rising of the Moon", "Spreading the News", "The Workhouse Ward",
        "The Gaol Gate", "Hyacinth Halvey"
    ],
    "W.B. Yeats": [
        "The Countess Cathleen", "Cathleen ni Houlihan", "The Land of Heart's Desire",
        "On Baile's Strand", "Deirdre", "The Green Helmet"
    ]
}


class GutenbergScraper:
    """Scrape plays from Project Gutenberg"""

    BASE_URL = "https://gutendex.com/books/"
    DOWNLOAD_BASE = "https://www.gutenberg.org/cache/epub/{}/pg{}.txt"

    def __init__(self, db: Session):
        self.db = db
        self.parser = PlainTextParser()

    def search_plays(self, author: str, title: Optional[str] = None) -> List[Dict]:
        """Search for plays by a specific author (English only)"""

        try:
            search_term = author
            if title:
                search_term = f'{title} {author}'

            response = requests.get(
                self.BASE_URL,
                params={
                    'search': search_term,
                    'mime_type': 'text/plain',
                    'languages': 'en'  # English only
                },
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])

                # Double-check language filtering (some results may slip through)
                english_results = []
                for book in results:
                    languages = book.get('languages', [])
                    if 'en' in languages or not languages:  # Include if English or language unknown
                        english_results.append(book)
                    else:
                        print(f"  ⊘ Skipping non-English book: {book.get('title', 'Unknown')} (languages: {languages})")

                return english_results
            else:
                print(f"Error searching Gutenberg: {response.status_code}")
                return []

        except Exception as e:
            print(f"Error searching Gutenberg: {e}")
            return []

    def download_text(self, book_id: int) -> Optional[str]:
        """Download book text from Gutenberg"""

        try:
            # Try primary download URL
            url = self.DOWNLOAD_BASE.format(book_id, book_id)
            response = requests.get(url, timeout=30)

            if response.status_code == 200:
                return response.text

            # Try alternate URL format
            url = f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt"
            response = requests.get(url, timeout=30)

            if response.status_code == 200:
                return response.text

            print(f"Could not download book {book_id}")
            return None

        except Exception as e:
            print(f"Error downloading book {book_id}: {e}")
            return None

    def extract_gutenberg_metadata(self, text: str) -> Dict:
        """Extract metadata from Gutenberg header"""

        metadata = {
            'title': None,
            'author': None,
            'language': 'en'
        }

        # Extract from header (first 2000 characters)
        header = text[:2000]

        # Find title
        title_match = re.search(r'Title:\s*(.+)', header)
        if title_match:
            metadata['title'] = title_match.group(1).strip()

        # Find author
        author_match = re.search(r'Author:\s*(.+)', header)
        if author_match:
            metadata['author'] = author_match.group(1).strip()

        return metadata

    def clean_gutenberg_text(self, text: str) -> str:
        """Remove Gutenberg header and footer"""

        # Find start of actual content
        start_markers = [
            "*** START OF THIS PROJECT GUTENBERG",
            "*** START OF THE PROJECT GUTENBERG",
            "*END*THE SMALL PRINT"
        ]

        start_pos = 0
        for marker in start_markers:
            pos = text.find(marker)
            if pos != -1:
                # Skip to end of line after marker
                start_pos = text.find('\n', pos) + 1
                break

        # Find end of content
        end_markers = [
            "*** END OF THIS PROJECT GUTENBERG",
            "*** END OF THE PROJECT GUTENBERG",
            "End of Project Gutenberg"
        ]

        end_pos = len(text)
        for marker in end_markers:
            pos = text.find(marker)
            if pos != -1:
                end_pos = pos
                break

        return text[start_pos:end_pos].strip()

    def ingest_play(
        self,
        book_id: int,
        play_title: str,
        author: str,
        genre: str = "drama",
        year_written: Optional[int] = None
    ) -> Optional[int]:
        """
        Download and ingest a play from Gutenberg.

        Returns:
            Number of monologues extracted, or None if failed
        """

        # Check if play already exists
        existing = self.db.query(Play).filter(
            Play.title == play_title,
            Play.author == author
        ).first()

        if existing:
            print(f"  ℹ️  Play already exists: {play_title}")
            return None

        # Download text
        print(f"  📥 Downloading: {play_title} by {author}")
        text = self.download_text(book_id)

        if not text:
            print(f"  ❌ Failed to download")
            return None

        # Clean text
        clean_text = self.clean_gutenberg_text(text)

        # Create Play record
        play = Play(
            title=play_title,
            author=author,
            year_written=year_written,
            genre=genre,
            category='classical',
            copyright_status='public_domain',
            source_url=f"https://www.gutenberg.org/ebooks/{book_id}",
            full_text=clean_text,
            text_format='plain',
            language='en'
        )

        self.db.add(play)
        self.db.commit()

        print(f"  ✅ Created play record (ID: {play.id})")

        # Extract monologues
        print(f"  🔍 Extracting monologues...")
        monologues = self.parser.extract_monologues(clean_text, min_words=50, max_words=500)

        print(f"  📝 Found {len(monologues)} potential monologues")

        # Save monologues
        count = 0
        for mono in monologues:
            try:
                monologue = Monologue(
                    play_id=play.id,
                    title=f"{mono['character']}'s speech from {play_title}",
                    character_name=mono['character'],
                    text=mono['text'],
                    stage_directions=mono.get('stage_directions'),
                    word_count=mono['word_count'],
                    estimated_duration_seconds=int(mono['word_count'] / 150 * 60)  # 150 wpm
                )
                self.db.add(monologue)
                count += 1

            except Exception as e:
                print(f"  ⚠️  Error creating monologue: {e}")
                continue

        self.db.commit()
        print(f"  ✨ Saved {count} monologues to database\n")

        return count

    def ingest_author_plays(
        self,
        author: str,
        play_titles: List[str],
        genre: str = "drama"
    ) -> Dict:
        """
        Ingest all plays by an author.

        Returns:
            {
                'plays_found': int,
                'plays_ingested': int,
                'total_monologues': int
            }
        """

        stats = {
            'plays_found': 0,
            'plays_ingested': 0,
            'total_monologues': 0
        }

        print(f"\n{'='*60}")
        print(f"📚 Ingesting plays by {author}")
        print(f"{'='*60}\n")

        for play_title in play_titles:
            # Search for the play
            results = self.search_plays(author, play_title)

            if not results:
                print(f"  ❌ Not found: {play_title}")
                continue

            # Get the first matching result
            book = results[0]
            book_id = book['id']

            stats['plays_found'] += 1

            # Ingest the play
            mono_count = self.ingest_play(
                book_id=book_id,
                play_title=play_title,
                author=author,
                genre=genre
            )

            if mono_count is not None:
                stats['plays_ingested'] += 1
                stats['total_monologues'] += mono_count

        print(f"\n{'='*60}")
        print(f"✅ Completed {author}")
        print(f"   Plays found: {stats['plays_found']}")
        print(f"   Plays ingested: {stats['plays_ingested']}")
        print(f"   Total monologues: {stats['total_monologues']}")
        print(f"{'='*60}\n")

        return stats


import re
