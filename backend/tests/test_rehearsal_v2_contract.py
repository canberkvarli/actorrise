"""The shape rehearsal reads from the extractor, and nothing more."""
import unittest

from app.models.actor import FilmTvReference, Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.user import User
from app.services.rehearsal.contract import RehearsalLine, lines_for, partner_characters
from tests.dbfixture import memory_db, restore

# FilmTvReference is here only because plays.film_tv_reference_id points at it
# and the fixture turns SQLite's foreign-key check on.
_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine)


class Contract(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        play = Play(title="P", author="A", source_type="play",
                    genre="drama", category="classical", copyright_status="public_domain")
        self.db.add(play); self.db.flush()
        self.scene = Scene(play_id=play.id, title="S", character_1_name="ANNA", character_2_name="BEN",
                           line_count=3, estimated_duration_seconds=60)
        self.db.add(self.scene); self.db.flush()
        for i, (who, text, sd) in enumerate([
            ("BEN", "Where were you?", None),
            ("ANNA", "Out.", "(not looking at him)"),
            ("MAID", "Dinner, madam.", None),
        ]):
            self.db.add(SceneLine(scene_id=self.scene.id, line_order=i, character_name=who, text=text,
                                  stage_direction=sd, word_count=len(text.split())))
        self.db.flush()

    def tearDown(self):
        self.db.close(); restore(self._saved)

    def test_lines_in_order_with_only_contract_fields(self):
        lines = lines_for(self.db, self.scene.id)
        self.assertEqual([l.index for l in lines], [0, 1, 2])
        self.assertEqual(lines[1], RehearsalLine(index=1, character="ANNA", text="Out.", direction="(not looking at him)"))
        self.assertIsNone(lines[0].direction)

    def test_partner_characters_is_everyone_but_the_actor(self):
        lines = lines_for(self.db, self.scene.id)
        self.assertEqual(partner_characters(lines, "ANNA"), ["BEN", "MAID"])
        self.assertEqual(partner_characters(lines, "anna"), ["BEN", "MAID"])
