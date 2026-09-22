"""Which of the actor's filters to give up when the page comes back empty.

An empty page is the worst answer available: the actor learns nothing, has
nothing to react to, and leaves. Something slightly wrong beats nothing, as long
as the page says what was widened.

Ordered by how little of their intent it costs:

- `emotion` first. The corpus tags one primary emotion per piece and a speech
  can carry several, so this label is the least reliable thing in the filter set.
- `tone` next, for the same reason with more confidence behind it.
- `category` (era) after that. Contemporary + play is 14 plays in this library,
  so it is usually the filter that emptied the shelf, but an actor who asked for
  contemporary generally meant it.
- `source_type` (the tab) LAST. "contemporary dramatic piece with sadness"
  returned nothing on Plays and 20 pieces unfiltered, because what matches
  sadness here is film and TV. Cross-tab recovery already existed for TITLES --
  its comment reads "the tab is how the library is filed; it is not what the
  actor wanted" -- and never covered attribute queries. This closes that.

`gender` is absent on purpose and must stay absent. Casting is not a
preference, and a female actor handed a male speech has been given a worse
answer than none at all.
"""

from typing import Dict, List

EMPTY_PAGE_RETRY_ORDER = ("emotion", "tone", "category", "source_type")


def retry_keys(filters: Dict) -> List[str]:
    """The filters actually set, in the order they should be surrendered."""
    return [k for k in EMPTY_PAGE_RETRY_ORDER if k in filters]
