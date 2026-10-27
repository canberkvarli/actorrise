"""A one-scene file has no heading, so its built scene was offered again."""

import unittest
from types import SimpleNamespace as NS

from app.services.script_additions import unlabelled_built


def row(i, act=None, scene=None):
    return NS(index=i, act_label=act, scene_label=scene)


def built(act=None, number=None):
    return NS(act=act, scene_number=number)


class UnlabelledBuilt(unittest.TestCase):
    def test_a_one_scene_file_is_built(self):
        self.assertEqual(unlabelled_built([row(0)], [built()]), [0])

    def test_nothing_built_is_nothing_built(self):
        self.assertEqual(unlabelled_built([row(0)], []), [])

    def test_counts_that_disagree_guess_nothing(self):
        self.assertEqual(unlabelled_built([row(0), row(1)], [built()]), [])

    def test_headed_rows_are_left_to_the_heading_match(self):
        self.assertEqual(unlabelled_built([row(0, "Act 1", "Scene 1")], [built("Act 1", "Scene 1")]), [])


if __name__ == "__main__":
    unittest.main()
