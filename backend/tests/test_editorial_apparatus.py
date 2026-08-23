"""Detecting scholarly apparatus that leaked into the play corpus.

Gutenberg editions wrap the play in footnotes, prefaces, cast lists and
collation notes; the extractor occasionally stored one as a speech. The gate
keys on a structural character_name plus the body shape, and must not touch a
real speech whose name happens to be short.
"""

from scripts.purge_editorial_apparatus import _is_junk


class TestApparatusDetection:
    def test_footnote_citation_is_junk(self):
        assert _is_junk("Note IV", "2. 298. The metre of this line is defective.")

    def test_named_label_is_junk(self):
        assert _is_junk("Preface", "The nature of the following work is sufficient.")
        assert _is_junk("Characters", "A Beggar A Townsman A Townswoman Their Sons")
        assert _is_junk("Argument", "The sickness hot, a master quit for fear.")

    def test_collation_annotation_is_junk(self):
        assert _is_junk("Act I", "Note : Changed to 2 in violet pencil. Lines cut.")

    def test_misfiled_sonnet_is_junk(self):
        assert _is_junk("I", '"From fairest creatures we desire increase, that..."')

    def test_scene_label_with_stage_direction_is_junk(self):
        assert _is_junk("Scene IV", "A hall in Blackfriars. Trumpets, sennet, and cornets.")

    def test_real_soliloquy_is_not_junk(self):
        # Maskwell's Double Dealer soliloquy — a short-ish name is fine.
        assert not _is_junk(
            "Maskwell", "Till then, success will attend me; for when I meet you...")

    def test_scene_label_with_real_speech_is_not_junk(self):
        # "Scene III" name but the body is a spoken soliloquy, not a stage
        # direction — the FIX path handles these, the purge must leave them.
        assert not _is_junk(
            "Scene III", "I know what she means by toying away an hour well enough.")
