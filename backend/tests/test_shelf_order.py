"""The shelf is arranged by the actor, not by upload date.

Scripts came back newest-first and there was no way to change it. An actor
working a scene for an audition next week has it slide down the shelf every
time they bring in anything else, and the piece they care about ends up below
three they don't.

`shelf_order` is that arrangement. NULL means "never arranged", and those sort
first by upload date, so a script brought in after an arrangement lands at the
top where it can be seen rather than at the bottom of a shelf the actor has
already tidied.

Arranging assigns a position to every script the actor owns, not only the ones
the client mentioned. A client sending a stale list — a script deleted in
another tab, an upload it hasn't seen yet — leaves the shelf fully ordered
either way, and nothing silently keeps a NULL that would jump it to the top on
the next load.

Sample scripts are excluded on purpose: they belong to no one and everyone
sees the same rows, so writing a position onto one would rearrange every
actor's shelf at once.
"""

import unittest
from datetime import datetime, timedelta

from app.api.scripts import apply_shelf_order, shelf_ordered
from app.models.actor import FilmTvReference, Play, Scene, UserScript
from app.models.organization import Organization
from app.models.user import User
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, FilmTvReference, Play, UserScript, Scene)

BASE = datetime(2026, 9, 1, 12, 0, 0)


class ShelfOrderTestCase(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.actor = User(email="actor@example.com", hashed_password="x")
        self.other = User(email="someone.else@example.com", hashed_password="x")
        self.db.add_all([self.actor, self.other])
        self.db.flush()

        # Brought in oldest first, so newest-first order is C, B, A.
        self.a = self._script("Hamlet", self.actor.id, BASE)
        self.b = self._script("Uncle Vanya", self.actor.id, BASE + timedelta(days=1))
        self.c = self._script("The Seagull", self.actor.id, BASE + timedelta(days=2))
        self.demo = self._script("The Breakup", None, BASE, is_sample=True)
        self.theirs = self._script("Their script", self.other.id, BASE)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def _script(self, title, user_id, created, is_sample=False):
        script = UserScript(
            user_id=user_id, title=title, author="Someone",
            original_filename=f"{title}.pdf", file_type="pdf",
            processing_status="completed", is_sample=is_sample,
            created_at=created,
        )
        self.db.add(script)
        self.db.flush()
        return script

    def _shelf(self):
        """Titles in the order the actor's shelf renders them."""
        rows = shelf_ordered(
            self.db.query(UserScript).filter(UserScript.user_id == self.actor.id)
        ).all()
        return [r.title for r in rows]


class AnUnarrangedShelfReadsNewestFirst(ShelfOrderTestCase):
    def test_nothing_arranged_yet(self):
        self.assertEqual(self._shelf(), ["The Seagull", "Uncle Vanya", "Hamlet"])

    def test_no_script_starts_with_a_position(self):
        self.assertTrue(all(s.shelf_order is None for s in (self.a, self.b, self.c)))


class ArrangingTheShelf(ShelfOrderTestCase):
    def test_the_order_asked_for_is_the_order_kept(self):
        apply_shelf_order(self.db, self.actor.id, [self.a.id, self.c.id, self.b.id])
        self.db.commit()
        self.assertEqual(self._shelf(), ["Hamlet", "The Seagull", "Uncle Vanya"])

    def test_positions_start_at_zero_and_do_not_skip(self):
        apply_shelf_order(self.db, self.actor.id, [self.c.id, self.a.id, self.b.id])
        self.db.commit()
        self.assertEqual([self.c.shelf_order, self.a.shelf_order, self.b.shelf_order], [0, 1, 2])

    def test_it_reports_the_shelf_it_wrote(self):
        got = apply_shelf_order(self.db, self.actor.id, [self.b.id, self.a.id, self.c.id])
        self.assertEqual(got, [self.b.id, self.a.id, self.c.id])

    def test_arranging_twice_is_the_second_arrangement(self):
        apply_shelf_order(self.db, self.actor.id, [self.a.id, self.b.id, self.c.id])
        apply_shelf_order(self.db, self.actor.id, [self.c.id, self.b.id, self.a.id])
        self.db.commit()
        self.assertEqual(self._shelf(), ["The Seagull", "Uncle Vanya", "Hamlet"])


class AStaleListFromTheClient(ShelfOrderTestCase):
    """The rail sends what it last rendered, which may not be what is there now."""

    def test_a_script_the_client_never_saw_goes_after_the_arrangement(self):
        fresh = self._script("Just uploaded", self.actor.id, BASE + timedelta(days=3))
        self.db.commit()
        apply_shelf_order(self.db, self.actor.id, [self.c.id, self.a.id, self.b.id])
        self.db.commit()
        self.assertEqual(
            self._shelf(), ["The Seagull", "Hamlet", "Uncle Vanya", "Just uploaded"]
        )
        self.assertEqual(fresh.shelf_order, 3)

    def test_unmentioned_scripts_are_not_left_without_a_position(self):
        """A leftover NULL would jump that script to the top on the next load."""
        apply_shelf_order(self.db, self.actor.id, [self.c.id])
        self.db.commit()
        self.assertTrue(all(s.shelf_order is not None for s in (self.a, self.b, self.c)))

    def test_an_id_that_no_longer_exists_is_skipped(self):
        got = apply_shelf_order(self.db, self.actor.id, [self.b.id, 9999, self.a.id])
        self.db.commit()
        self.assertEqual(got, [self.b.id, self.a.id, self.c.id])
        self.assertEqual(self._shelf(), ["Uncle Vanya", "Hamlet", "The Seagull"])

    def test_the_same_id_twice_counts_once(self):
        got = apply_shelf_order(self.db, self.actor.id, [self.a.id, self.a.id, self.b.id])
        self.assertEqual(got, [self.a.id, self.b.id, self.c.id])

    def test_an_empty_list_changes_nothing(self):
        apply_shelf_order(self.db, self.actor.id, [self.b.id, self.a.id, self.c.id])
        self.db.commit()
        apply_shelf_order(self.db, self.actor.id, [])
        self.db.commit()
        self.assertEqual(self._shelf(), ["Uncle Vanya", "Hamlet", "The Seagull"])


class WhatTheActorMayNotRearrange(ShelfOrderTestCase):
    def test_someone_elses_script_is_not_touched(self):
        apply_shelf_order(self.db, self.actor.id, [self.theirs.id, self.a.id])
        self.db.commit()
        self.assertIsNone(self.theirs.shelf_order)

    def test_and_it_does_not_take_a_place_on_this_shelf(self):
        got = apply_shelf_order(self.db, self.actor.id, [self.theirs.id, self.a.id])
        self.assertNotIn(self.theirs.id, got)
        self.assertEqual(got[0], self.a.id)

    def test_a_sample_is_shared_so_it_keeps_no_position(self):
        apply_shelf_order(self.db, self.actor.id, [self.demo.id, self.a.id])
        self.db.commit()
        self.assertIsNone(self.demo.shelf_order)


class ANewUploadIsVisible(ShelfOrderTestCase):
    """Sorting an arranged shelf by position alone would file every new script
    at the bottom, under everything the actor had already tidied."""

    def test_it_lands_at_the_top_not_the_bottom(self):
        apply_shelf_order(self.db, self.actor.id, [self.a.id, self.b.id, self.c.id])
        self.db.commit()
        self._script("Brought in today", self.actor.id, BASE + timedelta(days=9))
        self.db.commit()
        self.assertEqual(self._shelf()[0], "Brought in today")

    def test_two_new_ones_are_newest_first_above_the_arrangement(self):
        apply_shelf_order(self.db, self.actor.id, [self.a.id, self.b.id, self.c.id])
        self.db.commit()
        self._script("Yesterday", self.actor.id, BASE + timedelta(days=8))
        self._script("Today", self.actor.id, BASE + timedelta(days=9))
        self.db.commit()
        self.assertEqual(self._shelf()[:2], ["Today", "Yesterday"])


if __name__ == "__main__":
    unittest.main()
