"""The search feedback endpoint's contract.

fb_pos_30d was 0 and fb_neg_30d was 2 against 114 searches in the week to
2026-08-20, and no commented feedback had arrived since 2026-07-29 (H-11). The
question those numbers cannot answer on their own is whether the widget is
unloved or broken, so this pins the server half: a thumbs-up must succeed with
no comment, both search contexts the UI actually sends must be accepted, and
the one place that legitimately rejects input must keep rejecting it.

If these pass and the counts stay at zero, the cause is upstream — the control
is not being seen or not being clicked — not the POST.
"""

import unittest

from fastapi import HTTPException

from app.api.feedback import ALLOWED_CONTEXTS, FeedbackRequest, submit_feedback


class FakeBackgroundTasks:
    def __init__(self):
        self.tasks = []

    def add_task(self, fn, **kwargs):
        self.tasks.append((fn, kwargs))


class FakeDB:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, row):
        self.added.append(row)

    def commit(self):
        self.commits += 1


def call(**kwargs):
    db = FakeDB()
    result = submit_feedback(
        body=FeedbackRequest(**kwargs),
        background_tasks=FakeBackgroundTasks(),
        db=db,
        user=None,
    )
    return result, db


class ThumbsUpTests(unittest.TestCase):
    def test_positive_needs_no_comment(self):
        # The path that should be frictionless, and the one that reported zero
        # events in 30 days.
        result, db = call(context="search", rating="positive")
        self.assertEqual(result, {"ok": True})
        self.assertEqual(len(db.added), 1)
        self.assertEqual(db.added[0].rating, "positive")
        self.assertIsNone(db.added[0].comment)
        self.assertEqual(db.commits, 1)

    def test_both_search_contexts_the_ui_sends_are_accepted(self):
        # page.tsx renders the prompt twice: context="search" on the plays tab
        # and context="film_tv_search" on the film/TV tab. A context the server
        # rejects would 400 into a fire-and-forget .catch() and vanish.
        for ctx in ("search", "film_tv_search"):
            with self.subTest(context=ctx):
                result, db = call(context=ctx, rating="positive")
                self.assertEqual(result, {"ok": True})
                self.assertEqual(db.added[0].context, ctx)

    def test_anonymous_feedback_is_allowed(self):
        _, db = call(context="search", rating="positive")
        self.assertIsNone(db.added[0].user_id)


class RejectionTests(unittest.TestCase):
    def test_negative_without_a_comment_is_refused(self):
        # Deliberate, and mirrored in the widget: a bare down-vote records
        # nothing. Worth remembering when reading fb_neg — it counts actors who
        # typed a reason, not actors who were unhappy.
        with self.assertRaises(HTTPException) as ctx:
            call(context="search", rating="negative")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_negative_with_a_comment_is_stored(self):
        _, db = call(
            context="search", rating="negative", comment="wanted something funnier"
        )
        self.assertEqual(db.added[0].rating, "negative")
        self.assertEqual(db.added[0].comment, "wanted something funnier")

    def test_whitespace_comment_does_not_count_as_a_reason(self):
        with self.assertRaises(HTTPException) as ctx:
            call(context="search", rating="negative", comment="   ")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_unknown_context_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            call(context="dashboard_search", rating="positive")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_unknown_rating_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            call(context="search", rating="meh")
        self.assertEqual(ctx.exception.status_code, 400)


class ContextAllowlistTests(unittest.TestCase):
    def test_allowlist_still_covers_the_search_surfaces(self):
        # A rename on either side silently zeroes the metric, so pin it.
        self.assertIn("search", ALLOWED_CONTEXTS)
        self.assertIn("film_tv_search", ALLOWED_CONTEXTS)
