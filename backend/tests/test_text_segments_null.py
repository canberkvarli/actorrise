"""`text_segments = None` must become SQL NULL, not the JSON scalar `null`.

SQLAlchemy's JSON/JSONB types default to `none_as_null=False`, which serialises a
Python ``None`` into the JSON value ``null``. In Postgres that is a *scalar
stored in the column*, not an absent value, so:

    WHERE text_segments IS NULL        -- does NOT match it
    WHERE text_segments IS NOT NULL    -- DOES match it

Every backfill and audit selects work with the first predicate and reports
coverage with the second. 2,331 rows had been assigned ``None`` at some point,
and the effect was silent in both directions: `segment_monologues.py --write`
could never see them, so they were never segmented, while every coverage count
reported them as done. Clearing a row's segments — which the repair passes do
whenever they rewrite `text` — put the row in exactly that state.

It also breaks queries outright: `jsonb_array_length(text_segments)` raises
"cannot get array length of a scalar" the moment one of these rows is in scope.

The column now sets ``none_as_null=True``. This test pins that, because the
failure has no symptom you would notice by reading the app.
"""

import unittest

from sqlalchemy.dialects.postgresql import JSONB

from app.models.actor import Monologue


class TextSegmentsNullTests(unittest.TestCase):
    def test_column_maps_none_to_sql_null(self):
        col = Monologue.__table__.c.text_segments
        self.assertIsInstance(col.type, JSONB)
        self.assertTrue(
            col.type.none_as_null,
            "text_segments must use JSONB(none_as_null=True); without it, "
            "clearing a row's segments hides it from every `IS NULL` backfill",
        )

    def test_column_is_nullable(self):
        # Clearing segments is the documented way to make the reader fall back
        # to `text`, so the column has to accept a real NULL.
        self.assertTrue(Monologue.__table__.c.text_segments.nullable)


if __name__ == "__main__":
    unittest.main()
