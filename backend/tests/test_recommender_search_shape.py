"""
"Find for me" calls SemanticSearch.search(), which returns
([(monologue, score), ...], quote_match_types). The recommender once bound
that whole tuple as its result list, so the first thing it iterated was a
list, not a Monologue, and every request 500'd into the no-results state.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.search.recommender import Recommender


def _mono(i: int):
    return SimpleNamespace(id=i, overdone_score=0.0)


def _profile():
    return SimpleNamespace(
        gender="Male",
        age_range="18-25",
        experience_level="Emerging",
        preferred_genres=["Comedy"],
        profile_bias_enabled=True,
        overdone_alert_sensitivity=0.0,
    )


def test_find_for_me_unpacks_semantic_search_tuple():
    rec = Recommender.__new__(Recommender)
    rec.db = MagicMock()
    rec.semantic_search = MagicMock()
    rec.semantic_search.search.return_value = (
        [(_mono(1), 0.9), (_mono(2), 0.8), (_mono(3), 0.7)],
        {},
    )
    # The SQL and favourites/stretch pools need a real DB; pin them so the
    # test exercises only the shape handling around the semantic call.
    rec._get_sql_based_recommendations = MagicMock(return_value=[_mono(4)])
    rec._get_favorites_based_recommendations = MagicMock(return_value=[])
    rec._get_stretch_recommendations = MagicMock(return_value=[])

    results = rec.recommend_for_actor(_profile(), limit=4, user_id=1)

    # limit=4 → comfort pool is capped at int(4 * 0.7) = 2 by the blend.
    assert [m.id for m in results] == [1, 2]
    # Every returned row is a monologue, never a (monologue, score) pair.
    assert all(hasattr(m, "id") for m in results)
