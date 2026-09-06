"""Single source of truth for what we are allowed to store and serve.

`plays.copyright_status` and `plays.license_type` have existed since the first
ingest, but nothing ever read them. Every scraper wrote its own value, the API
served `monologues.text` unconditionally, and the promise on /sources —

    "Every piece links back to its source and original publication.
     We never host full scripts of copyrighted works."

was upheld by convention alone. With more aggregator sources arriving
(AuditionScenes, Daily Actor, NYCastings), convention does not scale: one
scraper that forgets to set a status silently starts publishing text we have no
basis for.

This module turns that promise into code. Ingest asks :func:`may_store_text`
before writing; the API asks :func:`may_serve_text` before returning. Both fail
CLOSED — an unrecognised or missing status means no text, never "probably fine".

Note the deliberate split: `copyright_status` says what the WORK is,
`license_type` says what OUR BASIS for using it is. A copyrighted work is fine
to excerpt with a basis (`fair_use`, `licensed`) and not fine without one. That
is why both columns are consulted and neither alone decides.
"""

from __future__ import annotations

# --- copyright_status: what the underlying work is -------------------------

PUBLIC_DOMAIN = "public_domain"
COPYRIGHTED = "copyrighted"
USER_UPLOADED = "user_uploaded"   # the actor's own script, uploaded by them
UNKNOWN = "unknown"

# --- license_type: our basis for using it ----------------------------------

LICENSE_PUBLIC_DOMAIN = "public_domain"
LICENSE_CC_BY = "cc_by"
LICENSE_LICENSED = "licensed"        # explicit written permission on file
LICENSE_FAIR_USE = "fair_use"        # short excerpt + attribution + link out
LICENSE_USER_CONTENT = "user_content"

#: Bases that permit holding the monologue text of a copyrighted work.
#: `fair_use` is length-bounded (see :data:`EXCERPT_MAX_WORDS`); `licensed` is
#: not, because a signed permission says what it says.
_COPYRIGHTED_TEXT_BASES = frozenset({
    LICENSE_FAIR_USE,
    LICENSE_LICENSED,
    LICENSE_CC_BY,
})

#: A fair-use excerpt stops being an excerpt somewhere. This matches
#: ``monologue_quality.DEFAULT_MAX_WORDS`` on purpose: the extraction ceiling
#: and the legal ceiling should not be able to drift apart.
EXCERPT_MAX_WORDS = 400

#: ...but only a COPYRIGHTED work needs that ceiling. 400 words is where an
#: excerpt stops being an excerpt, which is a statement about fair use and says
#: nothing about a play published in 1892.
#:
#: Applying it everywhere cost exactly the pieces the library is shortest of.
#: 21% of the speeches in the Perseus Greek drama corpus run past 400 words --
#: Ajax at 492, Medea at 472 -- and those are the three-and-four-minute pieces
#: that the whole week's scraping never moved: 254 in the 3-4 minute band and
#: 12 above four, unchanged. Every one of them was being rejected as `too_long`
#: by a rule written for somebody else's copyright.
#:
#: 900 words is about six minutes at performance pace. An actor cuts a long
#: speech down; they cannot lengthen one that was never stored.
PUBLIC_DOMAIN_MAX_WORDS = 900


def max_words_for(copyright_status: str | None,
                  license_type: str | None) -> int:
    """The longest text we may store for a work with these rights.

    Fair use is bounded by law; public domain is bounded only by what is useful.
    """
    if copyright_status in (PUBLIC_DOMAIN, USER_UPLOADED):
        return PUBLIC_DOMAIN_MAX_WORDS
    if license_type in (LICENSE_LICENSED, LICENSE_CC_BY):
        return PUBLIC_DOMAIN_MAX_WORDS
    return EXCERPT_MAX_WORDS


def may_store_text(
    copyright_status: str | None,
    license_type: str | None,
    *,
    word_count: int | None = None,
) -> bool:
    """May we persist the monologue text for a work with this rights profile?

    Fails closed: anything unrecognised, missing, or `unknown` returns False.

    ``word_count`` is optional and only tightens the answer — a fair-use excerpt
    longer than :data:`EXCERPT_MAX_WORDS` is not an excerpt, so it is refused
    even though the basis itself is valid.
    """
    status = (copyright_status or "").strip().lower()
    basis = (license_type or "").strip().lower()

    if status == PUBLIC_DOMAIN:
        return True
    if status == USER_UPLOADED:
        return True
    if status == COPYRIGHTED:
        if basis not in _COPYRIGHTED_TEXT_BASES:
            return False
        if (
            basis == LICENSE_FAIR_USE
            and word_count is not None
            and word_count > EXCERPT_MAX_WORDS
        ):
            return False
        return True
    return False


def may_serve_text(
    copyright_status: str | None,
    license_type: str | None,
    *,
    word_count: int | None = None,
) -> bool:
    """May we return the monologue text over the API?

    Currently identical to :func:`may_store_text`, and deliberately a separate
    function: if a licence lapses we want to be able to stop serving rows we are
    still allowed to keep, without a migration.
    """
    return may_store_text(copyright_status, license_type, word_count=word_count)


def text_basis(copyright_status: str | None, license_type: str | None) -> str:
    """Short label for why text is (or is not) allowed. For admin and logs."""
    status = (copyright_status or "").strip().lower()
    basis = (license_type or "").strip().lower()

    if status == PUBLIC_DOMAIN:
        return "public domain"
    if status == USER_UPLOADED:
        return "user's own upload"
    if status == COPYRIGHTED:
        if basis == LICENSE_FAIR_USE:
            return "excerpt under fair use"
        if basis == LICENSE_LICENSED:
            return "licensed"
        if basis == LICENSE_CC_BY:
            return "Creative Commons"
        return "copyrighted, no basis recorded"
    return "rights unknown"
