"""References: published pieces we point at, never hold (CAN-24)."""

import hashlib
import unittest
from pathlib import Path

from app.models.monologue_reference import MonologueReference
from app.services.search.reference_strip import (
    find_references,
    should_offer_references,
    wanted,
)
from scripts.load_monologue_references import read_references, to_sql
from tests.dbfixture import memory_db, restore


class LoaderTest(unittest.TestCase):
    def _csv(self, tmp: Path, body: str) -> Path:
        p = tmp / "refs.csv"
        p.write_text(body, encoding="utf-8")
        return p

    def test_speech_column_never_reaches_a_row_or_the_sql(self):
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            path = self._csv(Path(d), (
                "Title,Character Name,Character Gender,Author First,Author Last,"
                "Publisher,Play Genre,Notes,Monologue Text\n"
                "The Wolves,#46,Female,Sarah,DeLappe,Concord Theatricals,Drama,"
                "\"teen; age 16; year 2016; source: https://example.org/w\",THE SPEECH ITSELF\n"
            ))
            refs, dropped = read_references(path)
        self.assertEqual(dropped, ["Monologue Text"])
        self.assertNotIn("THE SPEECH", to_sql(refs))
        row = refs[0].row()
        self.assertTrue(row["is_teen"])
        self.assertEqual(row["character_age"], "16")
        self.assertEqual(row["year"], 2016)
        self.assertEqual(row["character_gender"], "female")
        self.assertEqual(row["source_url"], "https://example.org/w")
        self.assertIn("concordtheatricals.com", row["get_script_url"])

    def test_self_published_piece_links_to_its_own_page(self):
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            path = self._csv(Path(d), (
                "Title,Character Name,Author First,Author Last,Publisher,Notes\n"
                "Perfect Jimmy,Girl,Arthur M.,Jolly,Arthur M. Jolly (self),"
                "\"teen; source: https://arthurjolly.com/c.php\"\n"
            ))
            refs, _ = read_references(path)
        self.assertEqual(refs[0].row()["get_script_url"], "https://arthurjolly.com/c.php")
        self.assertEqual(refs[0].problems(), [])

    def test_teen_must_be_its_own_note_not_a_substring(self):
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            path = self._csv(Path(d), (
                "Title,Character Name,Author First,Author Last,Publisher,Notes\n"
                "Fifteen,Ann,A,B,Playscripts,\"age 40s; canteen worker\"\n"
            ))
            refs, _ = read_references(path)
        self.assertFalse(refs[0].is_teen)


class StripRulesTest(unittest.TestCase):
    def test_first_page_typed_search_only(self):
        self.assertTrue(should_offer_references(q="teen girl", constraints={}, page=1))
        self.assertFalse(should_offer_references(q="teen girl", constraints={}, page=2))
        self.assertFalse(should_offer_references(q="  ", constraints={}, page=1))

    def test_classical_ask_gets_no_references(self):
        self.assertFalse(should_offer_references(
            q="hamlet", constraints={"category": "classical"}, page=1))

    def test_wanted_reads_the_parsed_ask(self):
        w = wanted({"age_range": "teens", "gender": "female", "tone": "comedic"})
        self.assertTrue(w["teen"] and w["comic"])
        self.assertEqual(w["gender"], "female")


class FindReferencesTest(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([MonologueReference])
        raw = self.db.connection().connection.dbapi_connection
        raw.create_function("md5", 1, lambda s: hashlib.md5(str(s).encode()).hexdigest())
        raw.create_function("concat", 2, lambda a, b: f"{a}{b}")
        rows = [
            ("The Wolves", "#46", "Sarah DeLappe", "female", True, "drama"),
            ("Dance Nation", "Zuzu", "Clare Barron", "female", True, "comedy"),
            ("Speech & Debate", "Howie", "Stephen Karam", "male", True, "comedy"),
            ("Sylvia", "Greg", "A. R. Gurney", "male", False, "comedy"),
        ]
        for title, char, author, g, teen, genre in rows:
            self.db.add(MonologueReference(
                play_title=title, character_name=char, author=author,
                character_gender=g, is_teen=teen, genre=genre,
            ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_a_named_play_comes_back(self):
        got = find_references(self.db, q="dance nation", constraints={})
        self.assertEqual([r.character_name for r in got], ["Zuzu"])

    def test_teen_comedy_for_a_girl(self):
        got = find_references(self.db, q="funny teen girl", constraints={
            "age_range": "teens", "tone": "comedic", "gender": "female"})
        self.assertEqual([r.play_title for r in got], ["Dance Nation"])

    def test_nothing_to_go_on_gets_nothing(self):
        self.assertEqual(find_references(self.db, q="spongebob", constraints={}), [])


if __name__ == "__main__":
    unittest.main()


class TakedownTest(unittest.TestCase):
    def test_taken_down_is_hidden_from_search(self):
        from app.services.search.semantic_search import (
            HIDDEN_REVIEW_STATUSES, TAKEN_DOWN, review_hides_from_search,
        )
        self.assertIn(TAKEN_DOWN, HIDDEN_REVIEW_STATUSES)
        self.assertTrue(review_hides_from_search(TAKEN_DOWN))


class UploadsStayPrivateTest(unittest.TestCase):
    def test_exclude_hidden_drops_uploads(self):
        from app.models.actor import FilmTvReference, Monologue, Play
        from app.services.search.semantic_search import exclude_hidden

        db, saved = memory_db([FilmTvReference, Play, Monologue])
        try:
            common = dict(genre="drama", category="contemporary", language="en", source_type="play")
            pub = Play(title="Library Play", author="A", copyright_status="public_domain", **common)
            mine = Play(title="My Paste", author="B", copyright_status="user_uploaded", **common)
            db.add_all([pub, mine]); db.flush()
            for play in (pub, mine):
                db.add(Monologue(play_id=play.id, title="t", character_name="C", text="word " * 120,
                                 word_count=120, estimated_duration_seconds=48))
            db.commit()
            seen = {m.play_id for m in exclude_hidden(db.query(Monologue)).all()}
            self.assertEqual(seen, {pub.id})
        finally:
            db.close()
            restore(saved)
