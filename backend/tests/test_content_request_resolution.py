"""Closing a content request when the title actually lands.

Rows never closed themselves, so the admin queue became an archive of search
bugs that had already been fixed. The danger in automating it is the opposite
error: closing a request the library still cannot answer, which loses a real gap
silently. These tests pin the cases where it must NOT close.
"""

import unittest
from datetime import datetime, timezone

from app.models.actor import FilmTvReference, Monologue, Play
from app.models.content_request import ContentRequest
from app.models.organization import Organization
from app.models.user import User
from app.services.content_request_resolution import (
    resolve_finished_requests,
    title_is_live,
)
from tests.dbfixture import memory_db, restore


class TitleIsLiveTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(
            [Organization, User, FilmTvReference, Play, Monologue, ContentRequest]
        )

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _play(self, title, author="", *, pieces=1, review_status=None):
        # plays.author is NOT NULL, so an unattributed work is "" in practice.
        p = Play(
            title=title, author=author, source_type="play",
            genre="drama", category="contemporary", copyright_status="public_domain",
        )
        self.db.add(p)
        self.db.flush()
        for i in range(pieces):
            self.db.add(
                Monologue(
                    play_id=p.id,
                    title=f"{title} {i}",
                    character_name="Someone",
                    text="word " * 120,
                    word_count=120,
                    estimated_duration_seconds=60,
                    review_status=review_status,
                )
            )
        self.db.commit()
        return p

    def test_exact_title_with_a_live_piece_resolves(self):
        self._play("Better Call Saul")
        self.assertTrue(title_is_live(self.db, "better call saul"))

    def test_title_with_only_retired_pieces_does_not_resolve(self):
        self._play("Some Show", review_status="too_short")
        self.assertFalse(title_is_live(self.db, "Some Show"))

    def test_title_with_no_pieces_does_not_resolve(self):
        """A metadata-only shell is not an answer for the actor."""
        self._play("Friends", pieces=0)
        self.assertFalse(title_is_live(self.db, "Friends"))

    def test_spacing_difference_resolves(self):
        """The actor typed 'Pen 15'; the library stores 'Pen15'."""
        self._play("Pen15")
        self.assertTrue(title_is_live(self.db, "Pen 15"))

    def test_leading_article_is_not_the_same_title(self):
        """Jen Silverman's WITCH is not the 2015 film THE WITCH."""
        self._play("The Witch", author="Robert Eggers")
        self.assertFalse(title_is_live(self.db, "Witch"))

    def test_a_different_author_blocks_resolution(self):
        self._play("Witch", author="Robert Eggers")
        self.assertFalse(title_is_live(self.db, "Witch", author="Jen Silverman"))

    def test_same_author_resolves(self):
        self._play("Witch", author="Jen Silverman")
        self.assertTrue(title_is_live(self.db, "Witch", author="Jen Silverman"))

    def test_request_author_against_unattributed_play_resolves(self):
        """Missing author on our side is not evidence of a different work."""
        self._play("Witch", author="")
        self.assertTrue(title_is_live(self.db, "Witch", author="Jen Silverman"))

    def test_empty_title_never_resolves(self):
        self.assertFalse(title_is_live(self.db, "   "))


class ResolveFinishedRequestsTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(
            [Organization, User, FilmTvReference, Play, Monologue, ContentRequest]
        )
        p = Play(
            title="Mean Girls", author="", source_type="film",
            genre="comedy", category="contemporary", copyright_status="licensed",
        )
        self.db.add(p)
        self.db.flush()
        self.db.add(
            Monologue(
                play_id=p.id, title="Regina", character_name="Regina",
                text="word " * 120, word_count=120, estimated_duration_seconds=60,
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _request(self, title, status="requested"):
        # The fixture strips the now() server default, so supply the stamps.
        now = datetime(2026, 9, 19, tzinfo=timezone.utc)
        r = ContentRequest(
            play_title=title, request_count=1, status=status,
            first_requested_at=now, last_requested_at=now,
        )
        self.db.add(r)
        self.db.commit()
        return r

    def test_an_open_request_whose_title_landed_is_closed(self):
        r = self._request("Mean girls")
        self.assertEqual(resolve_finished_requests(self.db), 1)
        self.db.refresh(r)
        self.assertEqual(r.status, "added")

    def test_a_planned_request_is_closed_too(self):
        r = self._request("Mean girls", status="planned")
        resolve_finished_requests(self.db)
        self.db.refresh(r)
        self.assertEqual(r.status, "added")

    def test_a_rejected_request_is_left_alone(self):
        """A human said no. Landing the title does not overrule that."""
        r = self._request("Mean girls", status="rejected")
        self.assertEqual(resolve_finished_requests(self.db), 0)
        self.db.refresh(r)
        self.assertEqual(r.status, "rejected")

    def test_an_unmet_request_stays_open(self):
        r = self._request("Rosencrantz and Guildenstern Are Dead")
        self.assertEqual(resolve_finished_requests(self.db), 0)
        self.db.refresh(r)
        self.assertEqual(r.status, "requested")

    def test_running_twice_closes_nothing_the_second_time(self):
        self._request("Mean girls")
        self.assertEqual(resolve_finished_requests(self.db), 1)
        self.assertEqual(resolve_finished_requests(self.db), 0)


if __name__ == "__main__":
    unittest.main()
