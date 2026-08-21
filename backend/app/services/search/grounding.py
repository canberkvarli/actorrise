"""Did the results actually answer what was asked?

H-13. On 2026-08-21 an actor searched "Erin Gruwell", got 20 monologues and no
warning, then tried "Hillary Swank", then "Hilary Swank", then left. They wanted
a *Freedom Writers* piece. We carry none. Nothing ever told them so, so they
concluded they were searching wrong rather than that the library lacked the film.

`weak_match` could not catch this: it keys off best cosine alone, and a query
naming a person we do not have still lands *near* something thematically. The
score says "confident" while the answer says nothing about what was asked.

The check here is lexical, not semantic, and that is the point. If a query
carries a distinctive word — a name, a show, an invented string — and that word
appears nowhere in any result's title, character, author or text, then whatever
we returned, it is not what was asked for. Cosine cannot notice this. Substring
matching can.

Deliberately conservative, because a false positive tells an actor we failed
when we did not:

- Filter vocabulary is ignored, so "sad", "comedic 2 minute female" and other
  attribute searches never qualify. They have no distinctive word to ground.
- Ordinary words are ignored via a stopword list, so a thematic query like
  "two sisters arguing about their mother" is not judged on whether a result is
  *titled* "mother".
- Grounding is checked against the monologue TEXT as well as its metadata. A
  theme word almost always appears in some result's text, so real thematic
  queries stay grounded. A surname almost never does.
- One grounded token is enough. Only a query where EVERY distinctive word is
  missing everywhere is called ungrounded.
"""

from __future__ import annotations

import re
from typing import Iterable, Optional

from app.services.search.query_optimizer import _FILTER_WORDS

# Ordinary English that carries meaning but is not distinctive enough to demand
# a literal match. A thematic query is built almost entirely from these.
_COMMON = frozenset("""
a an the and or but if then than that this these those there here
i me my we us our you your he him his she her it its they them their
is are was were be been being am do does did done have has had
of in on at to for from with without about into over under between
by as so not no nor too very just only also even still yet
who whom whose what which when where why how all any both each few more most
other some such own same
one two three four five six seven eight nine ten first second last next
man woman men women boy girl boys girls kid kids child children teen teens
adult adults person people guy guys lady ladies
mother father mom dad parent parents son daughter sister brother sisters
brothers wife husband friend friends lover family baby
love loves loved hate hates hated death dying dead die dies life live living
lost losing lose loss grief grieving anger angry sad sadness happy joy fear
afraid hope hopeful power revenge betrayal identity war peace god
speech speeches piece pieces text texts line lines part parts role roles
play plays player scene scenes act acts show shows story stories
audition auditions monologue monologues soliloquy character characters
say says said tell tells told talk talks talking speak speaks speaking
go goes going come comes coming get gets got make makes made take takes
know knows knew think thinks thought want wants wanted need needs feel feels
look looks see sees saw give gives gave find finds found
good bad great little big long short new old young high low right wrong
time times day days night nights year years moment moments
about around because before after again always never
""".split())

# Descriptive vocabulary actors use that `_FILTER_WORDS` does not cover. Every
# word added here can only make the check MORE conservative — it removes a
# reason to call a search ungrounded — so err toward including things. "late"
# is the one that caught this: "contemporary comedic male monologue late 20s"
# was flagged ungrounded purely because "late 20s" survived as distinctive.
_DESCRIPTORS = frozenset("""
late early mid middle aged ages older younger elderly senior junior
emotional intense powerful quiet gentle soft loud dark light heavy raw
vulnerable honest simple complex subtle bold strong weak sharp warm cold
silly quirky edgy witty clever charming awkward nervous confident
period shakespearean classic classical modern contemporary victorian greek
roman elizabethan restoration absurdist naturalistic
dramatic comedic comedy drama tragic tragedy dramedy seriocomic
open opening close closing cold read reading callback callbacks
mfa bfa college school university conservatory showcase
""".split())

_MIN_TOKEN_LEN = 4


def _tokens(query: str) -> list[str]:
    text = (query or "").lower()
    # Drop possessives before splitting: "Crowley's monologue" must look for
    # "crowley", which is what the corpus stores. Without this the token stays
    # "crowley's", matches nothing, and a character we DO carry (4 monologues)
    # is reported as something we have never heard of.
    text = re.sub(r"'s\b", "", text)
    return re.sub(r"[^a-z0-9\s-]", " ", text).split()


def distinctive_terms(query: str) -> list[str]:
    """Words specific enough that a real answer ought to contain one of them."""
    out: list[str] = []
    for w in _tokens(query):
        w = w.strip("'-")
        if len(w) < _MIN_TOKEN_LEN:
            continue
        if w in _FILTER_WORDS or w.replace("-", "") in _FILTER_WORDS:
            continue
        if w in _COMMON or w in _DESCRIPTORS:
            continue
        if re.fullmatch(r"[\d-]+[a-z]*", w):
            continue
        out.append(w)
    return out


# Above this many words a query is describing a piece, not naming one. "angry
# young man confronting his father" is a real thematic search and must never be
# called unservable; "Erin Gruwell" is a name. Measured on 400 replayed
# searches: every false positive the first version produced was 4 words or
# more, and every true positive was 3 or fewer.
_MAX_WORDS_FOR_NAME_QUERY = 3


def query_is_unservable(query: str, db) -> bool:
    """True when a short query's distinctive words appear NOWHERE in the corpus.

    Not "these results are poor" — cosine already tries to say that and cannot,
    because a name still lands near something. This asks a different and much
    more answerable question: does the library contain this word at all? If
    "gruwell" appears in none of 12,435 monologues, no ranking of them is an
    answer to "Erin Gruwell".

    Two guards keep it honest, both learned from replaying 400 real searches:

    - Long queries are exempt. A 5-word query is describing a piece, and being
      told "no strong match" for "young woman discovers her voice" — which we
      answer well — undersells the library for nothing.
    - The term must be missing from `corpus_terms`, which is built FROM the
      corpus rather than from a hand-written list of ordinary English. The list
      version flagged "ambition", "overlooked" and "confession".

    Never raises: a missing or empty `corpus_terms` degrades to False, i.e. the
    old behaviour, rather than calling every search unservable.
    """
    if db is None:
        return False

    # Consider the query as typed AND as the typo-corrector would rewrite it,
    # and treat it as servable if EITHER form is. Two failure modes, opposite
    # directions, both real:
    #   "Comedic monologues femalr" is servable only after correction;
    #   "rising seniors" is servable only BEFORE it, because the corrector
    #   fuzzy-matches "rising" to "raisin" (A Raisin in the Sun) and would
    #   otherwise have us deny a play we carry.
    forms = [query]
    try:
        from app.services.search.query_optimizer import correct_query_typos

        # Returns (corrected, changed, ...) — take the string, not the tuple.
        result = correct_query_typos(query)
        corrected = (result[0] if isinstance(result, tuple) else result) or query
        if corrected != query:
            forms.append(corrected)
    except Exception:
        pass

    if min(len(_tokens(f)) for f in forms) > _MAX_WORDS_FOR_NAME_QUERY:
        return False

    per_form = [(f, distinctive_terms(f)) for f in forms]
    # A form with nothing distinctive left is pure filter vocabulary and is
    # answerable by definition — "Comedic monologues femalr" corrects to
    # "Comedic monologues female", which has no distinctive term at all.
    if any(not terms for _f, terms in per_form):
        return False

    all_terms = sorted({t for _f, terms in per_form for t in terms})

    from sqlalchemy import text as sa_text

    try:
        known = {
            r[0]
            for r in db.execute(
                sa_text("SELECT term FROM corpus_terms WHERE term = ANY(:t)"),
                {"t": all_terms},
            ).fetchall()
        }
    except Exception:
        return False
    if not known and not _corpus_terms_populated(db):
        # Table absent or not built yet — do not accuse every query.
        return False

    # EVERY distinctive word must be known for a form to be servable. "Any one
    # is enough" was tried and let "Erin Gruwell" through, because "erin"
    # appears somewhere in the corpus while "gruwell" appears nowhere — and it
    # is the surname that decides whether we hold the film.
    return not any(all(t in known for t in terms) for _f, terms in per_form)


def _corpus_terms_populated(db) -> bool:
    from sqlalchemy import text as sa_text

    try:
        return bool(
            db.execute(sa_text("SELECT 1 FROM corpus_terms LIMIT 1")).first()
        )
    except Exception:
        return False
