"""A hidden row has no embedding; a visible row has one.

WHY THIS IS A TEST AND NOT A COMMENT. On 2026-09-10 Supabase cut the site off at
560 MB against a 500 MB tier. 61% of the database was `embedding_vector` and its
HNSW index, and 4,550 of the 23,950 rows holding a vector were retired ones that
no search path can return by any query. They were paying full storage for a
result set of zero.

Dropping those vectors is only safe while un-hiding re-embeds. A retired row can
come back: `ungate_above_floor` frees anything that grows past the word floor,
and a moderator can approve or dismiss a flagged row. Either path, done naively,
puts a row back in the library with no vector -- present, and invisible to every
semantic query. Nothing would have raised an error; the piece would simply never
appear in a result again.

This project's recurring failure is one rule with two copies that drift (the
word floor in 13 places, the review gate on 1 of 5 search paths). So the rule
lives in `app.services.monologue_visibility`, and these tests assert that the
paths which move a row across the line actually go through it.
"""

import ast
import unittest
from pathlib import Path

from app.services.monologue_visibility import hide, unhide
from app.services.search.semantic_search import HIDDEN_REVIEW_STATUSES

BACKEND = Path(__file__).resolve().parent.parent


class _Row:
    """Enough of a Monologue for the visibility rule.

    `build_monologue_enriched_text` reads widely across the row, so anything it
    might touch answers None rather than raising -- the subject here is the
    hide/unhide rule, not the wording of the embedded string.
    """

    def __init__(self, status=None, vector=None, text="a speech"):
        self.id = 1
        self.review_status = status
        self.review_reasons = None
        self.proposed_text = None
        self.embedding_vector = vector
        self.text = text
        self.play = None

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return None


class _Analyzer:
    def __init__(self):
        self.calls = 0

    def generate_embedding(self, _text):
        self.calls += 1
        return [0.0] * 1536


class HideReleasesTheVectorTests(unittest.TestCase):
    def test_hiding_drops_the_embedding(self):
        row = _Row(vector=[0.1] * 1536)
        hide(row, "too_short")
        self.assertEqual(row.review_status, "too_short")
        self.assertIsNone(
            row.embedding_vector,
            "a row search cannot return must not hold 6 KB of float32",
        )

    def test_hiding_refuses_a_status_that_does_not_hide(self):
        """`hide(row, 'approved')` would drop the vector of a visible row."""
        row = _Row(vector=[0.1] * 1536)
        with self.assertRaises(ValueError):
            hide(row, "approved")
        self.assertIsNotNone(row.embedding_vector)


class UnhideBuysTheVectorBackTests(unittest.TestCase):
    def test_a_retired_row_is_re_embedded_on_the_way_back(self):
        row = _Row(status="too_short", vector=None)
        analyzer = _Analyzer()
        bought = unhide(None, row, analyzer=analyzer)
        self.assertTrue(bought)
        self.assertEqual(analyzer.calls, 1)
        self.assertIsNone(row.review_status)
        self.assertIsNotNone(
            row.embedding_vector,
            "back in the library but unfindable is the failure this prevents",
        )

    def test_a_row_that_kept_its_vector_is_not_re_bought(self):
        row = _Row(status="pending", vector=[0.1] * 1536)
        analyzer = _Analyzer()
        self.assertFalse(unhide(None, row, analyzer=analyzer))
        self.assertEqual(analyzer.calls, 0, "no reason to pay OpenAI twice")
        self.assertIsNone(row.review_status)

    def test_changed_text_forces_a_fresh_vector(self):
        """Approving rewrites `text`; the old vector describes what was there."""
        row = _Row(status="pending", vector=[0.1] * 1536, text="the corrected speech")
        analyzer = _Analyzer()
        self.assertTrue(unhide(None, row, analyzer=analyzer, force_embed=True))
        self.assertEqual(analyzer.calls, 1)

    def test_a_failed_embedding_leaves_the_row_hidden(self):
        """Hidden beats visible-and-unfindable: the backfill can see hidden."""

        class Broken:
            def generate_embedding(self, _t):
                raise RuntimeError("openai down")

        row = _Row(status="too_short", vector=None)
        with self.assertRaises(RuntimeError):
            unhide(None, row, analyzer=Broken())
        self.assertEqual(row.review_status, "too_short")


class TheCallersActuallyUseItTests(unittest.TestCase):
    """Source-scanning, because an import that is never called proves nothing."""

    def test_the_re_embed_job_skips_rows_search_cannot_return(self):
        """Without this filter the next backfill re-buys all 4,550 vectors."""
        src = (BACKEND / "app/services/ai/batch_processor.py").read_text()
        self.assertIn("HIDDEN_REVIEW_STATUSES", src)

    def test_admin_review_clears_through_unhide(self):
        src = (BACKEND / "app/api/admin/monologues.py").read_text()
        self.assertIn("unhide", src)
        self.assertNotIn(
            "mono.review_status = None",
            src,
            "clearing the status by hand bypasses the re-embed",
        )

    def test_ungate_script_clears_through_unhide(self):
        src = (BACKEND / "scripts/ungate_above_floor.py").read_text()
        self.assertIn("unhide(db, mono)", src)
        self.assertNotIn(
            "{Monologue.review_status: None}",
            src,
            "a bulk UPDATE to NULL frees rows without giving them a vector",
        )

    def test_the_patch_endpoint_re_embeds_after_the_text_lands(self):
        """Order matters: clearing before setattr embeds the replaced text."""
        src = (BACKEND / "app/api/admin/monologues.py").read_text()
        tree = ast.parse(src)
        fn = next(
            n for n in ast.walk(tree)
            if isinstance(n, ast.FunctionDef) and n.name == "admin_update_monologue"
        )
        lines = [
            n.lineno for n in ast.walk(fn)
            if isinstance(n, ast.Call)
            and isinstance(n.func, ast.Name)
            and n.func.id in ("setattr", "_clear_review")
        ]
        setattr_line = min(
            n.lineno for n in ast.walk(fn)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
            and n.func.id == "setattr"
        )
        clear_line = max(
            n.lineno for n in ast.walk(fn)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
            and n.func.id == "_clear_review"
        )
        self.assertGreater(
            clear_line, setattr_line,
            "_clear_review must run after the new text is on the row",
        )


class TheHidingSetIsTheSearchGateTests(unittest.TestCase):
    def test_drop_script_never_touches_a_status_search_would_serve(self):
        from scripts.drop_hidden_embeddings import DROP_STATUSES

        for status in DROP_STATUSES:
            self.assertIn(
                status, HIDDEN_REVIEW_STATUSES,
                f"{status!r} is servable; dropping its vector hides live rows",
            )

    def test_pending_keeps_its_vector(self):
        """A moderator usually approves; re-buying minutes later is the worse trade."""
        from scripts.drop_hidden_embeddings import DROP_STATUSES

        self.assertNotIn("pending", DROP_STATUSES)


if __name__ == "__main__":
    unittest.main()
