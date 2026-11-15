"""The empty-page retry for a dotted acronym (W.A.S.P. found nothing, WASP three)."""

import inspect

from app.api import monologues
from app.services.search.acronym import collapse_dotted_acronyms


def test_dots_come_out_of_an_acronym():
    assert collapse_dotted_acronyms("W.A.S.P.") == "WASP"
    assert collapse_dotted_acronyms("w.a.s.p.") == "wasp"
    assert collapse_dotted_acronyms("carly in g.b.f. forever") == "carly in gbf forever"
    assert collapse_dotted_acronyms("U.S.A") == "USA"


def test_ordinary_queries_are_left_alone():
    for q in ("hamlet", "Mr. Darcy", "St. Joan, 1 minute", "a. a. milne", "", "dr. who vs. them"):
        assert collapse_dotted_acronyms(q) == q


def test_it_is_a_retry_after_an_empty_page_not_a_rewrite():
    src = inspect.getsource(monologues)
    retry = src.index("collapse_dotted_acronyms(search_q)")
    # The title lookup and the first search see the query as typed.
    assert src.index("match_strategy = \"vector\"") < retry
    # And it runs before any of the actor's filters are given up.
    assert retry < src.index("from app.services.search.empty_page_retry import retry_keys")
