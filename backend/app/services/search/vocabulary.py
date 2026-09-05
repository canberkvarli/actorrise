"""
One place where a user-facing vocabulary is translated into a corpus one.

Three vocabularies exist and none of them agree:

  * the ACTOR PROFILE stores age as 18-25 / 25-35 / 35-45 / 45-55 / 55+
  * the SEARCH DROPDOWN offers teens / 20s / 30s / 40s / 50s / 60+
  * the CORPUS stores whatever each ingestion pipeline happened to write:
    20s, 30s, 40s, teens, 20-30, 30-40, 40-50, 50s, 60+, child, any

That is survivable. What was not survivable is that the translation between
them had been copied into five separate places — AGE_MAPPING in the
recommender, _AGE_SYNONYMS in semantic search, _AGE_TO_CORPUS in the
monologues API, KEYWORD_MAPPINGS in the query optimiser, and the option lists
on the frontend. One of them was missing the profile bands entirely, so
profile-driven recommendations hard-filtered on a string no row contains and
"Find for me" returned nothing for all 379 users who had set an age. Nothing
failed loudly; the feature simply had no results, forever.

So the mapping lives here once, and tests/test_profile_vocabulary.py asserts
that every value a user can actually produce lands on something the corpus
actually holds.
"""

from typing import Dict, Tuple

# Age values genuinely present in `monologues.character_age_range`.
# Snapshot taken from production 2026-09-06; "child" and "any" included
# because rows carry them, even though no profile band maps to "child".
CORPUS_AGE_VALUES: Tuple[str, ...] = (
    "teens", "20s", "30s", "40s", "50s", "60+",
    "20-30", "30-40", "40-50", "child", "any",
)

# The bands the actor profile can store — see lib/profileOptions.ts AGE_RANGES.
# Keep in step with that list; the test fails if a band maps to nothing real.
PROFILE_AGE_TO_CORPUS: Dict[str, Tuple[str, ...]] = {
    "18-25": ("teens", "20s", "20-30"),
    "25-35": ("20s", "20-30", "30s", "30-40"),
    "35-45": ("30s", "30-40", "40s", "40-50"),
    "45-55": ("40s", "40-50", "50s"),
    "55+": ("50s", "60+"),
}

# Genres the profile can store, and which Play column each actually lives in.
#
# `plays.category` holds ONLY "classical" and "contemporary". The dramatic
# genre is in `plays.genre`. Filtering the profile's genres against `category`
# alone — which is what the recommender did — matched zero plays for Drama and
# Comedy, the two most common preferences on the platform.
#
#   "genre"    → match against plays.genre
#   "category" → match against plays.category
#   "author"   → match against plays.author (Shakespeare is a person)
#   None       → the catalogue has no such column value; do not filter on it
PROFILE_GENRE_COLUMN: Dict[str, str | None] = {
    "Drama": "genre",
    "Comedy": "genre",
    "Contemporary": "category",
    "Classical": "category",
    "Shakespeare": "author",
    "Musical": None,
}


def corpus_ages_for_profile_band(band: str | None) -> Tuple[str, ...]:
    """Corpus age values for a profile band. Empty tuple when unmapped."""
    if not band:
        return ()
    return PROFILE_AGE_TO_CORPUS.get(band.strip(), ())
