"""Daily Actor pages and the REST writer that stores them from a cloud session.

The page shape below is copied from a live page (2026-11-05), trimmed.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import scrape_contemporary_plays as scp  # noqa: E402
from app.services.data_ingestion import rest_writer  # noqa: E402
from app.services.data_ingestion.cross_source_dedupe import text_fingerprint  # noqa: E402

SPEECH = (
    "You know, let me just like preface this with, uh, I have lived most of my life in the "
    "shadow of a brother I barely knew, and I have about this much left, ok? "
) * 4


def page(medium: str = "Play", cue: str = "Trip", second: str = "", character: str = "Trip Wyeth, a bright, funny, TV producer") -> bytes:
    return f"""
<div class="details post-dynamic" style="x"><h3 style="y"><strong><span style="color: #3366ff;">'Other Desert Cities' by Jon Robin Baitz</span></strong></h3><p style="m"><strong style="f">From</strong>: <span style="f">{medium}</span></p><p><strong>Character</strong>: <span>{character}</span></p><p><strong>Gender</strong>: <span>Male</span></p><p><strong style="f">More: <span id="more-link"><a href="http://amzn.to/1yAizdL" >Buy the Play</a></span></strong></p></div>
<div class="entry-content clear" itemprop="text">
<p><strong>{cue}</strong>: {SPEECH}</p>
<p>And I&#8217;m out. I&#8217;m done.</p>
{second}
<div id='jp-relatedposts' class='jp-relatedposts' ></div>
</div>""".encode()


LINK = scp.Link(url="https://www.dailyactor.com/monologues/x/", character_name="", label="x")


def test_reads_title_author_character_and_speech():
    parsed, why = scp.extract_dailyactor(LINK, page())
    assert why is None
    assert parsed.play_title == "Other Desert Cities"
    assert parsed.author == "Jon Robin Baitz"
    assert parsed.character_name == "Trip"
    assert parsed.text.startswith("You know")  # the cue is not part of the speech
    assert parsed.text.endswith("I’m done.")
    assert parsed.genre == "drama"
    assert parsed.url == LINK.url  # credit is the page, never the affiliate link


def test_screen_work_is_never_taken():
    for medium in ("Movie", "TV"):
        parsed, why = scp.extract_dailyactor(LINK, page(medium=medium))
        assert parsed is None and why.startswith("not_stage")


def test_musical_is_marked_musical():
    parsed, _ = scp.extract_dailyactor(LINK, page(medium="Musical"))
    assert parsed.genre == "musical"


def test_a_scene_is_not_a_monologue():
    parsed, why = scp.extract_dailyactor(LINK, page(second="<p><strong>Polly</strong>: Stop it.</p>"))
    assert parsed is None and why == "two_speakers"


def test_unnamed_speaker_falls_back_to_gender():
    html = page(cue="", character="").replace(b"<strong></strong>: ", b"")
    parsed, _ = scp.extract_dailyactor(LINK, html)
    assert parsed.character_name == "Man"


def test_sitemap_discovery_dedupes():
    xml = ("<loc>https://www.dailyactor.com/monologues/a/</loc>" * 2
           + "<loc>https://www.dailyactor.com/news/b/</loc>")
    links = scp.discover_dailyactor(scp._DA_SITEMAP, xml)
    assert [link.url for link in links] == ["https://www.dailyactor.com/monologues/a/"]


def test_no_year_and_public_domain_years_are_not_kept():
    parsed, _ = scp.extract_dailyactor(LINK, page())
    assert "no_verified_year" in scp.evaluate(parsed, {}).reasons
    old = scp.evaluate(parsed, {"other desert cities": 1900})
    assert "public_domain_era" in old.reasons
    ok = scp.evaluate(parsed, {"other desert cities": 2010})
    assert ok.category == "contemporary" and "no_verified_year" not in ok.reasons


# ── REST writer ──────────────────────────────────────────────────────────────

class FakeRest:
    def __init__(self, plays=None, monologues=None):
        self.plays = plays or []
        self.monologues = monologues or []
        self.posted: list[tuple[str, dict]] = []

    def get(self, table, **params):
        if table == "plays":
            title = params["title"][3:]
            return [p for p in self.plays if p["title"] == title
                    and ("author" not in params or p["author"] == params["author"][3:])]
        if table == "monologues":
            return list(self.monologues)
        return []

    def post(self, table, body):
        self.posted.append((table, body))
        if table == "plays":
            row = {**body, "id": 900}
            self.plays.append(row)
            return [row]
        return [{**body, "id": 5000}]

    def patch(self, table, body, **params):
        return []


class FakeAnalyzer:
    def analyze_monologue(self, **kw):
        return {"tone": "dramatic", "character_gender": "male", "character_age_range": "30s"}

    def generate_search_tags(self, analysis, text, character):
        return ["family"]


def embed(texts, model, dimensions):
    return [[1.0] + [0.0] * 1535 for _ in texts]


TEXT = ("I have lived most of my life in the shadow of a brother I barely knew and "
        "everyone at this table keeps telling me what I am supposed to feel about it. ") * 5


def kwargs(**over):
    base = dict(play_title="Other Desert Cities", author="Jon Robin Baitz", character="Trip",
                text=TEXT, copyright_status="copyrighted", license_type="fair_use",
                source_url="https://www.dailyactor.com/monologues/x/", year_written=2010,
                category="contemporary", min_words=50, analyzer=FakeAnalyzer(), embed=embed)
    base.update(over)
    return base


def test_rest_inserts_play_then_monologue():
    rest = FakeRest()
    report = rest_writer.ingest_monologue_rest(rest, **kwargs())
    assert report.inserted_ids == [5000] and report.play_created
    play = rest.posted[0][1]
    assert play["language"] == "en" and play["license_type"] == "fair_use"
    mono = rest.posted[1][1]
    assert mono["embedding_vector"].startswith("[1.000000,")


def test_rest_refuses_without_rights_or_era():
    rest = FakeRest()
    assert rest_writer.ingest_monologue_rest(rest, **kwargs(license_type=None)).refused
    assert rest_writer.ingest_monologue_rest(rest, **kwargs(category=None)).refused
    assert rest.posted == []


def test_rest_catches_same_title_duplicates():
    play = {"id": 7, "title": "Other Desert Cities", "author": "Jon Robin Baitz",
            "copyright_status": "copyrighted", "license_type": "fair_use", "year_written": 2010}
    exact = FakeRest([dict(play)], [{"id": 1, "text": TEXT.upper(), "embedding_vector": None}])
    assert rest_writer.ingest_monologue_rest(exact, **kwargs()).duplicates == 1
    near = FakeRest([dict(play)], [{"id": 1, "text": "other words", "embedding_vector": "[1.0" + ",0.0" * 1535 + "]"}])
    assert rest_writer.ingest_monologue_rest(near, **kwargs()).duplicates == 1
    assert all(t != "monologues" for t, _ in exact.posted + near.posted)


def test_rest_skips_what_was_rejected_before():
    rest = FakeRest()
    report = rest_writer.ingest_monologue_rest(rest, **kwargs(), rejected={text_fingerprint(TEXT)})
    assert report.already_rejected == 1 and rest.posted == []
