"""Every search query that returns monologues must apply the review gate.

`HIDDEN_REVIEW_STATUSES` is the rule that keeps retired pieces out of results:
`too_short` (under the 75-word floor), `not_monologue` (a two-hander), and
`pending` (broken, awaiting a human). It only works if every query that selects
rows for a user applies it, and that is exactly what kept failing.

The gate was written inline on ONE of the five Monologue queries in
`semantic_search` — the pgvector path — and `recommender` had none at all.
So 6,271 rows were retired in the database, the deploy went out, and a search
for "funny and for women" still returned 35-word pieces, because that query
routes to the keyword-match fallback rather than the vector path. The retirement
looked applied and was not.

A unit test cannot catch that: each individual query works fine. What is wrong
is the set of them, so this test reads the source and checks coverage.

Opting out is deliberate and visible: put `# Not gated:` above the statement and
say why. There is one, the seed row in `get_similar_monologues` — you are
allowed to ask for pieces similar to the one already open.
"""

import ast
import inspect
import unittest
from pathlib import Path

from app.services.search import recommender, semantic_search

GUARD = "exclude_hidden"
OPT_OUT = "# Not gated:"

MODULES = [semantic_search, recommender]


def _statements_selecting_monologues(source: str):
    """Yield (lineno, source_segment) for each statement running query(Monologue)."""
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.stmt):
            continue
        # Only the innermost statement, so a function body does not count as
        # "containing" every query inside it.
        if any(isinstance(c, ast.stmt) for c in ast.iter_child_nodes(node)):
            continue
        segment = ast.get_source_segment(source, node) or ""
        if "query(Monologue)" in segment:
            yield node.lineno, segment


class ReviewGateCoverageTests(unittest.TestCase):
    def test_every_monologue_query_applies_the_gate(self):
        ungated = []
        for module in MODULES:
            path = Path(inspect.getfile(module))
            source = path.read_text()
            lines = source.splitlines()
            for lineno, segment in _statements_selecting_monologues(source):
                if GUARD in segment:
                    continue
                # An explicit, commented opt-out in the few lines above.
                preceding = "\n".join(lines[max(0, lineno - 5): lineno])
                if OPT_OUT in preceding:
                    continue
                ungated.append(f"{path.name}:{lineno}  {segment.strip()[:70]}")

        self.assertEqual(
            ungated, [],
            "These queries select monologues without applying the review gate, "
            "so retired pieces will be served:\n  " + "\n  ".join(ungated)
            + f"\n\nWrap them in {GUARD}(), or mark '{OPT_OUT} <reason>' above.",
        )

    def test_the_guard_is_importable_where_it_is_used(self):
        """A NameError here would only ever surface in production.

        `recommender` used the guard before importing it. Nothing failed at
        import time, because the name is resolved when the function runs, and
        no test exercised those code paths — so the module imported cleanly and
        every recommendation would have raised.
        """
        for module in MODULES:
            source = Path(inspect.getfile(module)).read_text()
            if GUARD + "(" in source:
                with self.subTest(module=module.__name__):
                    self.assertTrue(
                        hasattr(module, GUARD),
                        f"{module.__name__} calls {GUARD}() but does not import it",
                    )

    def test_the_gate_covers_all_three_retirement_statuses(self):
        self.assertEqual(
            semantic_search.HIDDEN_REVIEW_STATUSES,
            frozenset({"pending", "too_short", "not_monologue"}),
        )


if __name__ == "__main__":
    unittest.main()
